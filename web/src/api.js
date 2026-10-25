export const USE_MOCK = false;
const BASE = 'http://localhost:8000';

const wait = (ms = 300) => new Promise((r) => setTimeout(r, ms + Math.random() * 200));

// Fallback mock definitions in case backend connection drops
const fallbackAssets = [
  ['CASH', 'Cash', 'CASH', 3000, 650],
  ['TBILL_91D', 'T-Bill 91D', 'TBILL', 2000, 120],
  ['GSEC_2029', 'G-Sec 2029', 'GSEC_MID', 4000, 90],
  ['GSEC_2034', 'G-Sec 2034', 'GSEC_LONG', 3000, 80],
  ['CORP_AAA_2028', 'Corporate AAA', 'CORP_AAA', 2000, 50],
  ['NIFTY50_BASKET', 'Nifty 50 Basket', 'EQUITY', 2500, 35],
].map(([id, name, cls, quantity, cost]) => ({
  id,
  name,
  class: cls,
  quantity,
  price_bps: 10000,
  funding_cost_bps: cost,
}));

const fallbackObligations = [
  { id: 'O1', name: 'CCP initial margin', counterparty: 'CCIL', required_lakh: 6000, priority: 1 },
  { id: 'O2', name: 'Bilateral OTC margin', counterparty: 'Counterparty Bank B', required_lakh: 4500, priority: 2 },
  { id: 'O3', name: 'Bank repo', counterparty: 'Lender Bank A', required_lakh: 5000, priority: 3 },
];

const fallbackHc = { CASH: 0, TBILL: 50, GSEC_MID: 200, GSEC_LONG: 400, CORP_AAA: 400, EQUITY: 1500 };
const fallbackEligible = {
  O1: ['CASH', 'TBILL', 'GSEC_MID', 'GSEC_LONG'],
  O2: ['GSEC_MID', 'GSEC_LONG', 'CORP_AAA', 'EQUITY'],
  O3: ['TBILL', 'GSEC_MID'],
};

const fallbackRules = fallbackObligations.flatMap((o) =>
  fallbackEligible[o.id].map((cls) => ({ obligation_id: o.id, class: cls, haircut_bps: fallbackHc[cls] }))
);

const fallbackScenario = {
  id: 'REF',
  name: 'Tight inventory, three obligations',
  description: 'Priority-aware allocation across constrained collateral pools.',
  assets: fallbackAssets,
  obligations: fallbackObligations,
  rules: fallbackRules,
};

const mockUnits = [
  ['CASH', 'O1', 2665],
  ['TBILL_91D', 'O1', 756],
  ['GSEC_2029', 'O1', 19],
  ['GSEC_2034', 'O1', 2671],
  ['GSEC_2029', 'O2', 142],
  ['GSEC_2034', 'O2', 329],
  ['CORP_AAA_2028', 'O2', 2000],
  ['NIFTY50_BASKET', 'O2', 2500],
  ['TBILL_91D', 'O3', 1244],
  ['GSEC_2029', 'O3', 3839],
];

const mockTotals = {
  optimiser: { funding_cost_lakh: 275.97, shortfall_lakh: 0, effective_cost_lakh: 275.97, utilisation_pct: 98 },
  cash_first: { funding_cost_lakh: 268.26, shortfall_lakh: 5000, effective_cost_lakh: 718.26, utilisation_pct: 64.6 },
  cheapest_first: { funding_cost_lakh: 102.75, shortfall_lakh: 2666.02, effective_cost_lakh: 342.69, utilisation_pct: 81.8 },
  scarcity_aware: { funding_cost_lakh: 294.69, shortfall_lakh: 0, effective_cost_lakh: 294.69, utilisation_pct: 97.9 },
};

const makeMockPlan = (method = 'optimiser') => {
  const opt = method === 'optimiser' || method === 'scarcity_aware';
  const lines = (opt ? mockUnits : mockUnits.filter((x) => x[1] !== 'O3')).map(([aid, oid, u], i) => {
    const a = fallbackAssets.find((x) => x.id === aid);
    const haircut_bps = fallbackHc[a.class];
    return {
      asset_id: aid,
      obligation_id: oid,
      units: u,
      market_value_lakh: u,
      haircut_bps,
      usable_lakh: +(u * (1 - haircut_bps / 10000)).toFixed(2),
      annual_cost_lakh: +((u * a.funding_cost_bps) / 10000).toFixed(2),
      reason: i ? 'Lowest marginal cost' : 'Priority protected',
    };
  });
  const short = mockTotals[method].shortfall_lakh;
  return {
    plan_id: `REF-${method}-1`,
    scenario_id: 'REF',
    method,
    status: 'ready',
    runtime_ms: 38,
    lines,
    coverage: fallbackObligations.map((o) => ({
      obligation_id: o.id,
      required_lakh: o.required_lakh,
      covered_lakh: o.id === 'O3' ? o.required_lakh - short : o.required_lakh,
      covered: !(o.id === 'O3' && short),
      shortfall_lakh: o.id === 'O3' ? short : 0,
      reason: short && o.id === 'O3' ? 'Eligible collateral exhausted' : 'Requirement met',
    })),
    remaining: fallbackAssets.map((a) => ({
      asset_id: a.id,
      units: a.quantity - lines.filter((l) => l.asset_id === a.id).reduce((s, l) => s + l.units, 0),
    })),
    totals: mockTotals[method],
  };
};

let mockCommitted = false;
let mockUsed = new Set();
let mockEvents = [];

const mockState = () => ({
  block: mockCommitted ? 12 : 42,
  assets: fallbackAssets.map((a) => {
    const r = mockCommitted ? mockUnits.filter((x) => x[0] === a.id).reduce((s, x) => s + x[2], 0) : 0;
    return {
      asset_id: a.id,
      total: a.quantity,
      reserved: r,
      available: a.quantity - r,
      version: mockCommitted ? 1 + mockUnits.filter((x) => x[0] === a.id).length : 1,
    };
  }),
});

async function mock(path, body) {
  await wait();
  if (path === '/health') return { ok: true, chain_id: 31337, block: mockCommitted ? 12 : 42 };
  if (path === '/scenarios')
    return [
      { id: 'REF', name: fallbackScenario.name },
      { id: 'REF_SHORT', name: 'Insufficient collateral' },
      { id: 'S1', name: 'Haircut arbitrage' },
      { id: 'S2', name: 'Two obligations competing' },
      { id: 'S3', name: 'Priority inversion' },
      { id: 'S5', name: 'Price shock' },
    ];
  if (path.startsWith('/scenarios/')) return fallbackScenario;
  if (path === '/state') return mockState();
  if (path === '/events') return mockEvents;
  if (path === '/reset') {
    mockCommitted = false;
    mockUsed.clear();
    mockEvents = [];
    return { ok: true, block: 3 };
  }
  if (path === '/optimise') return makeMockPlan(body.method);
  if (path === '/compare') return Object.keys(mockTotals).map(makeMockPlan);
  if (path === '/commit') {
    if (mockUsed.has(body.plan_id)) return { ok: false, error: 'DuplicateAllocation', args: { allocation_id: body.plan_id } };
    mockUsed.add(body.plan_id);
    mockCommitted = true;
    const plan = makeMockPlan(body.plan_id.split('-')[1] || 'optimiser');
    const now = new Date().toISOString();
    mockEvents = [
      {
        type: 'AllocationCommitted',
        allocation_id: body.plan_id,
        actor: 'Desk 1',
        reason: 'Plan sealed',
        tx_hash: '0xb7e4…9ac2',
        block: 12,
        time: now,
      },
      ...plan.lines.map((l, i) => ({
        type: 'Reserved',
        allocation_id: body.plan_id,
        asset_id: l.asset_id,
        obligation_id: l.obligation_id,
        units: l.units,
        actor: 'Desk 1',
        reason: 'Collateral reserved',
        tx_hash: `0x${i}a4f…c12`,
        block: 12,
        time: now,
      })),
    ];
    return { ok: true, tx_hash: '0xb7e4f20…9ac2', block: 12, plan_hash: '0x8c019f4…81de' };
  }
  if (path === '/attack') {
    const errors = {
      double_pledge: ['InsufficientQuantity', { asset: 'CASH', requested: 336, available: 335 }],
      duplicate: ['DuplicateAllocation', { allocation_id: 'REF-optimiser-1' }],
      excessive: ['InsufficientQuantity', { asset: 'CORP_AAA_2028', requested: 2001, available: 0 }],
      ineligible: ['Ineligible', { asset: 'NIFTY50_BASKET', obligation: 'O3' }],
      stale: ['StalePlan', { asset: 'CASH', expected: 1, actual: 2 }],
    };
    const [error, args] = errors[body.type] || ['UnknownError', {}];
    const ev = {
      type: 'Rejected',
      actor: 'Desk 2',
      reason: error,
      args,
      tx_hash: '—',
      block: mockState().block,
      time: new Date().toISOString(),
    };
    mockEvents = [ev, ...mockEvents];
    return { ok: false, error, args, actor: 'Desk 2' };
  }
}

async function request(path, options = {}) {
  const r = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!r.ok) {
    const errorBody = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(errorBody.detail || `API error ${r.status}`);
  }
  return r.json();
}

export async function api(path, body) {
  if (USE_MOCK) return mock(path, body);
  try {
    const options = body ? { method: 'POST', body: JSON.stringify(body) } : { method: 'GET' };
    return await request(path, options);
  } catch (err) {
    console.warn(`[Nexora Live API] Falling back to mock for ${path}:`, err.message);
    return mock(path, body);
  }
}

export const health = async () => {
  const h = await api('/health');
  return {
    ok: Boolean(h?.ok || h?.chain_connected),
    chain_id: h?.chain_id || 31337,
    block: h?.block || 0,
    contract_address: h?.contract_address || null,
  };
};

export const getScenarios = () => api('/scenarios');

export const getScenario = (id) => api(`/scenarios/${id.toLowerCase()}`);

export const reset = (scenario_id) => api('/reset', { scenario_id: scenario_id.toLowerCase() });

export const optimise = (scenario_id, method) =>
  api('/optimise', { scenario_id: scenario_id.toLowerCase(), method });

export const compare = async (scenario_id) => {
  const data = await api('/compare', { scenario_id: scenario_id.toLowerCase() });
  if (data && !Array.isArray(data)) {
    return Object.values(data);
  }
  return Array.isArray(data) ? data : [];
};

export const commit = (plan_id) => api('/commit', { plan_id });

export const getState = async () => {
  const data = await api('/state');
  if (Array.isArray(data)) {
    return { block: 0, assets: data };
  }
  return data || { block: 0, assets: [] };
};

export const getEvents = () => api('/events');

export const attack = (type) => api('/attack', { type });

export const stress = (params) => api('/stress', params);

export const shock = (params) => api('/shock', params);

export const reoptimise = (params) => api('/reoptimise', params);

export const commitDiff = (plan_id, old_plan_id) => api('/commit-diff', { plan_id, old_plan_id });

export const verify = (plan_id, simulate_tamper = false) => api('/verify', { plan_id, simulate_tamper });
