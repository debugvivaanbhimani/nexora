export const USE_MOCK = true;
const BASE = 'http://localhost:8000';
const wait = () => new Promise(r => setTimeout(r, 300 + Math.random() * 400));
const assets = [
  ['CASH','Cash','CASH',3000,650],['TBILL_91D','T-Bill 91D','TBILL',2000,120],
  ['GSEC_2029','G-Sec 2029','GSEC_MID',4000,90],['GSEC_2034','G-Sec 2034','GSEC_LONG',3000,80],
  ['CORP_AAA_2028','Corporate AAA','CORP_AAA',2000,50],['NIFTY50_BASKET','Nifty 50 Basket','EQUITY',2500,35]
].map(([id,name,cls,quantity,cost])=>({id,name,class:cls,quantity,price_bps:10000,funding_cost_bps:cost}));
const obligations = [
  {id:'O1',name:'CCP initial margin',counterparty:'CCIL',required_lakh:6000,priority:1},
  {id:'O2',name:'Bilateral OTC margin',counterparty:'Counterparty Bank B',required_lakh:4500,priority:2},
  {id:'O3',name:'Bank repo',counterparty:'Lender Bank A',required_lakh:5000,priority:3}
];
const hc={CASH:0,TBILL:50,GSEC_MID:200,GSEC_LONG:400,CORP_AAA:400,EQUITY:1500};
const eligible={O1:['CASH','TBILL','GSEC_MID','GSEC_LONG'],O2:['GSEC_MID','GSEC_LONG','CORP_AAA','EQUITY'],O3:['TBILL','GSEC_MID']};
const rules=obligations.flatMap(o=>eligible[o.id].map(cls=>({obligation_id:o.id,class:cls,haircut_bps:hc[cls]})));
const scenario={id:'REF',name:'Tight inventory, three obligations',description:'Priority-aware allocation across constrained collateral pools.',assets,obligations,rules};
const units=[['CASH','O1',2665],['TBILL_91D','O1',756],['GSEC_2029','O1',19],['GSEC_2034','O1',2671],['GSEC_2029','O2',142],['GSEC_2034','O2',329],['CORP_AAA_2028','O2',2000],['NIFTY50_BASKET','O2',2500],['TBILL_91D','O3',1244],['GSEC_2029','O3',3839]];
const totals={
  optimiser:{funding_cost_lakh:275.97,shortfall_lakh:0,effective_cost_lakh:275.97,utilisation_pct:98},
  cash_first:{funding_cost_lakh:268.26,shortfall_lakh:5000,effective_cost_lakh:718.26,utilisation_pct:64.6},
  cheapest_first:{funding_cost_lakh:102.75,shortfall_lakh:2666.02,effective_cost_lakh:342.69,utilisation_pct:81.8},
  scarcity_aware:{funding_cost_lakh:294.69,shortfall_lakh:0,effective_cost_lakh:294.69,utilisation_pct:97.9}
};
const makePlan=(method='optimiser')=>{
  const opt=method==='optimiser'||method==='scarcity_aware';
  const lines=(opt?units:units.filter(x=>x[1]!=='O3')).map(([aid,oid,u],i)=>{
    const a=assets.find(x=>x.id===aid), haircut_bps=hc[a.class];
    return {asset_id:aid,obligation_id:oid,units:u,market_value_lakh:u,haircut_bps,usable_lakh:+(u*(1-haircut_bps/10000)).toFixed(2),annual_cost_lakh:+(u*a.funding_cost_bps/10000).toFixed(2),reason:i?'Lowest marginal cost':'Priority protected'};
  });
  const short=totals[method].shortfall_lakh;
  return {plan_id:`REF-${method}-1`,scenario_id:'REF',method,status:'ready',runtime_ms:38,lines,
    coverage:obligations.map(o=>({obligation_id:o.id,required_lakh:o.required_lakh,covered_lakh:o.id==='O3'?o.required_lakh-short:o.required_lakh,covered:!(o.id==='O3'&&short),shortfall_lakh:o.id==='O3'?short:0,reason:short&&o.id==='O3'?'Eligible collateral exhausted':'Requirement met'})),
    remaining:assets.map(a=>({asset_id:a.id,units:a.quantity-lines.filter(l=>l.asset_id===a.id).reduce((s,l)=>s+l.units,0)})),totals:totals[method]};
};
let committed=false, used=new Set(), events=[];
const state=()=>({block:committed?12:42,assets:assets.map(a=>{const r=committed?units.filter(x=>x[0]===a.id).reduce((s,x)=>s+x[2],0):0;return {asset_id:a.id,total:a.quantity,reserved:r,available:a.quantity-r,version:committed?1+units.filter(x=>x[0]===a.id).length:1}})});
const request=async(path,options)=>{const r=await fetch(BASE+path,{headers:{'Content-Type':'application/json'},...options});if(!r.ok)throw new Error(`API ${r.status}`);return r.json()};
async function mock(path,body){
  await wait();
  if(path==='/health')return {ok:true,chain_id:31337,block:committed?12:42};
  if(path==='/scenarios')return [{id:'REF',name:scenario.name},{id:'REF_SHORT',name:'Insufficient collateral'},{id:'S1',name:'Haircut arbitrage'},{id:'S5',name:'Price shock'}];
  if(path.startsWith('/scenarios/'))return scenario;
  if(path==='/state')return state();
  if(path==='/events')return events;
  if(path==='/reset'){committed=false;used.clear();events=[];return {ok:true,block:3}};
  if(path==='/optimise')return makePlan(body.method);
  if(path==='/compare')return Object.keys(totals).map(makePlan);
  if(path==='/commit'){
    if(used.has(body.plan_id))return {ok:false,error:'DuplicateAllocation',args:{allocation_id:body.plan_id}};
    used.add(body.plan_id);committed=true;
    const plan=makePlan(body.plan_id.split('-')[1]||'optimiser'), now=new Date().toISOString();
    events=[{type:'AllocationCommitted',allocation_id:body.plan_id,actor:'Desk 1',reason:'Plan sealed',tx_hash:'0xb7e4…9ac2',block:12,time:now,on_chain:true},
      ...plan.lines.map((l,i)=>({type:'Reserved',allocation_id:body.plan_id,asset_id:l.asset_id,obligation_id:l.obligation_id,units:l.units,available_after:state().assets.find(a=>a.asset_id===l.asset_id).available,actor:'Desk 1',reason:'Collateral reserved',tx_hash:`0x${i}a4f…c12`,block:12,time:now,on_chain:true}))];
    return {ok:true,tx_hash:'0xb7e4f20…9ac2',block:12,plan_hash:'0x8c019f4…81de'};
  }
  if(path==='/attack'){
    const errors={double_pledge:['InsufficientQuantity',{asset:'CASH',requested:336,available:335}],duplicate:['DuplicateAllocation',{allocation_id:'REF-optimiser-1'}],excessive:['InsufficientQuantity',{asset:'CORP_AAA_2028',requested:2001,available:0}],ineligible:['Ineligible',{asset:'NIFTY50_BASKET',obligation:'O3'}],stale:['StalePlan',{asset:'CASH',expected:1,actual:2}]};
    const [error,args]=errors[body.type], ev={type:'Rejected',actor:'Desk 2',reason:error,args,tx_hash:'—',block:state().block,time:new Date().toISOString(),on_chain:false};
    events=[ev,...events]; return {ok:false,error,args,actor:'Desk 2'};
  }
}
export async function api(path,body){return USE_MOCK?mock(path,body):request(path,body&&{method:'POST',body:JSON.stringify(body)})}
export const health=()=>api('/health'); export const getScenarios=()=>api('/scenarios'); export const getScenario=id=>api(`/scenarios/${id}`);
export const reset=scenario_id=>api('/reset',{scenario_id}); export const optimise=(scenario_id,method)=>api('/optimise',{scenario_id,method});
export const compare=scenario_id=>api('/compare',{scenario_id}); export const commit=plan_id=>api('/commit',{plan_id});
export const getState=()=>api('/state'); export const getEvents=()=>api('/events'); export const attack=type=>api('/attack',{type});
