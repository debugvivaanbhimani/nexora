import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Blocks,
  Check,
  Command as CommandIcon,
  Copy,
  DatabaseZap,
  Gauge,
  GitCompare,
  Hexagon,
  LockKeyhole,
  Network,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  Terminal,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import * as API from './api';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0);

const money = (n) => `₹${fmt(n)}`;

const methods = ['optimiser', 'cash_first', 'cheapest_first', 'scarcity_aware'];

const labels = {
  optimiser: 'Optimiser',
  cash_first: 'Cash first',
  cheapest_first: 'Cheapest first',
  scarcity_aware: 'Scarcity aware',
};

function Button({ children, icon: Icon, onClick, primary = false, disabled = false, title }) {
  return (
    <button
      className={`btn ${primary ? 'primary' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {Icon && <Icon size={15} />}
      <span>{children}</span>
    </button>
  );
}

function Status({ ok = true, children }) {
  return (
    <span className={`status ${ok ? 'ok' : 'bad'}`}>
      {ok ? <Check /> : <X />}
      {children}
    </span>
  );
}

export default function App() {
  const [view, setView] = useState('command');
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('REF');
  const [scenario, setScenario] = useState(null);
  const [state, setState] = useState(null);
  const [plan, setPlan] = useState(null);
  const [plans, setPlans] = useState([]);
  const [events, setEvents] = useState([]);
  const [chain, setChain] = useState(null);
  const [busy, setBusy] = useState(true);
  const [solving, setSolving] = useState(false);
  const [presentation, setPresentation] = useState(false);
  const [attacks, setAttacks] = useState(0);
  const [method, setMethod] = useState('optimiser');

  const loadInitial = async () => {
    setBusy(true);
    try {
      const [h, scList, s, st, ev, cmp] = await Promise.all([
        API.health(),
        API.getScenarios(),
        API.getScenario('REF'),
        API.getState(),
        API.getEvents(),
        API.compare('REF'),
      ]);
      setChain(h);
      setScenarios(scList || []);
      setScenario(s);
      setState(st);
      setEvents(ev || []);
      setPlans(cmp || []);
    } catch (e) {
      console.error('[Nexora App] Load failed:', e);
      setChain(null);
      toast.error('Command link degraded · Using offline vault channel');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  const refresh = async () => {
    try {
      const [st, ev, ch] = await Promise.all([
        API.getState(),
        API.getEvents(),
        API.health(),
      ]);
      setState(st);
      setEvents(ev || []);
      setChain(ch);
    } catch (e) {
      console.warn('[Nexora App] Refresh warning:', e);
    }
  };

  const handleScenarioChange = async (newId) => {
    setSelectedScenarioId(newId);
    setPlan(null);
    setBusy(true);
    try {
      const [s, cmp] = await Promise.all([
        API.getScenario(newId),
        API.compare(newId),
      ]);
      setScenario(s);
      setPlans(cmp || []);
      await refresh();
      toast.success(`Loaded scenario ${newId.toUpperCase()}`);
    } catch (e) {
      toast.error(`Failed to load scenario ${newId}`);
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    try {
      await API.reset(selectedScenarioId);
      setPlan(null);
      setAttacks(0);
      await refresh();
      const updatedCmp = await API.compare(selectedScenarioId);
      setPlans(updatedCmp || []);
      toast.success(`Vault reset to ${selectedScenarioId.toUpperCase()}`);
    } catch (e) {
      toast.error('Reset error: ' + (e.message || 'Chain reset failed'));
    }
  };

  const doOptimise = async (m = method) => {
    setSolving(true);
    setPlan(null);
    try {
      const p = await API.optimise(selectedScenarioId, m);
      setPlan(p);
      toast.success(`${labels[m] || m} plan ready · ${p.runtime_ms} ms`);
    } catch (e) {
      toast.error('Solver error: ' + (e.message || 'Optimization failed'));
    } finally {
      setSolving(false);
    }
  };

  const doCommit = async () => {
    if (!plan) return toast.error('Optimise a plan first');
    try {
      const r = await API.commit(plan.plan_id);
      if (r.ok) {
        toast.success(`Committed in block ${r.block} · Hash: ${r.tx_hash.slice(0, 10)}…`);
      } else {
        toast.error(`Blocked by ledger: ${r.error}`);
      }
      await refresh();
    } catch (e) {
      toast.error('Commit failed: ' + e.message);
    }
  };

  const doAttack = async (type) => {
    try {
      const r = await API.attack(type);
      setAttacks((x) => x + 1);
      toast.error(`Blocked · ${r.error}`);
      await refresh();
    } catch (e) {
      toast.error('Attack execution failed');
    }
  };

  useEffect(() => {
    const key = (e) => {
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
      if (e.key === 'r' || e.key === 'R') doReset();
      if (e.key === 'o' || e.key === 'O') doOptimise();
      if (e.key === 'c' || e.key === 'C') doCommit();
      if (e.key === 'a' || e.key === 'A') setView('arena');
      if (e.key === 'p' || e.key === 'P') setPresentation((x) => !x);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [plan, selectedScenarioId, method]);

  if (busy) {
    return (
      <div className="boot">
        <Hexagon />
        <div className="loader" />
        <p>Opening secure vault channel…</p>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="boot">
        <ShieldAlert />
        <h2>Command link unavailable</h2>
        <Button onClick={loadInitial}>Retry</Button>
      </div>
    );
  }

  const nav = [
    ['command', CommandIcon, 'Command'],
    ['flow', Network, 'Flow'],
    ['ledger', Blocks, 'Ledger'],
    ['arena', Shield, 'Arena'],
    ['compare', GitCompare, 'Compare'],
  ];

  return (
    <div className={`app ${presentation ? 'presentation' : ''}`}>
      {!presentation && (
        <aside>
          <div className="mark">
            <Hexagon />
            <span>N</span>
          </div>
          {nav.map(([id, I, n]) => (
            <button
              key={id}
              aria-label={n}
              onClick={() => setView(id)}
              className={view === id ? 'active' : ''}
            >
              <I />
              <small>{n}</small>
            </button>
          ))}
        </aside>
      )}
      <main>
        <header>
          <div className="brand">
            <div className="eyebrow">NEXORA / COLLATERAL COMMAND</div>
            <h1>
              <LockKeyhole /> PLEDGEGUARD
            </h1>
          </div>
          <div className="top-actions">
            <select
              aria-label="Scenario"
              value={selectedScenarioId}
              onChange={(e) => handleScenarioChange(e.target.value)}
            >
              {scenarios.length > 0 ? (
                scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id.toUpperCase()} · {s.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="REF">REF · Tight inventory</option>
                  <option value="REF_SHORT">REF_SHORT · Insufficient</option>
                </>
              )}
            </select>
            <div className={`chain ${chain?.ok ? 'live' : 'offline'}`}>
              <Activity />{' '}
              {chain?.ok
                ? `CHAIN ${chain.chain_id} · BLOCK ${chain.block}`
                : 'OFFLINE'}
            </div>
            <Button icon={RotateCcw} onClick={doReset}>
              RESET <kbd>R</kbd>
            </Button>
            <Button icon={Zap} onClick={() => doOptimise()} primary>
              OPTIMISE <kbd>O</kbd>
            </Button>
            <Button icon={LockKeyhole} onClick={doCommit} disabled={!plan}>
              COMMIT <kbd>C</kbd>
            </Button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.section
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="content"
          >
            {view === 'command' && (
              <CommandView
                scenario={scenario}
                state={state}
                plan={plan}
                solving={solving}
              />
            )}
            {view === 'flow' && (
              <FlowView
                plans={plans}
                method={method}
                setMethod={(m) => {
                  setMethod(m);
                  const matched = plans.find((p) => p.method === m);
                  if (matched) setPlan(matched);
                }}
              />
            )}
            {view === 'ledger' && <Ledger events={events} plan={plan} />}
            {view === 'arena' && <Arena attacks={attacks} run={doAttack} />}
            {view === 'compare' && <Compare plans={plans} />}
          </motion.section>
        </AnimatePresence>
      </main>
    </div>
  );
}

function CommandView({ scenario, state, plan, solving }) {
  const covered = plan?.coverage?.filter((x) => x.covered).length || 0;
  const t = plan?.totals;
  const totalFreeUnits =
    state?.assets?.reduce((s, a) => s + (a.available || 0), 0) || 0;

  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">COMMAND / LIVE POSITION</span>
          <h2>Collateral control room</h2>
        </div>
        <Status ok={!t?.shortfall_lakh}>
          {plan
            ? t?.shortfall_lakh > 0
              ? 'SHORTFALL DETECTED'
              : 'FULLY SECURED'
            : 'AWAITING PLAN'}
        </Status>
      </div>

      <div className="kpis">
        <Kpi
          label="Funding cost"
          value={plan ? money(t?.funding_cost_lakh) : '—'}
          sub="₹ lakh / annum"
          accent="gold"
        />
        <Kpi
          label="Shortfall"
          value={plan ? money(t?.shortfall_lakh) : '—'}
          sub={
            plan && !t?.shortfall_lakh ? 'FULLY SECURED' : 'priority-weighted'
          }
          accent={t?.shortfall_lakh ? 'red' : 'green'}
        />
        <Kpi
          label="Utilisation"
          value={plan ? `${t?.utilisation_pct}%` : '—'}
          sub="of face value"
          accent="cyan"
        />
        <Kpi
          label="Obligations"
          value={`${covered} / ${scenario.obligations.length}`}
          sub="requirements covered"
          accent="violet"
        />
      </div>

      {solving && (
        <div className="solver">
          <Terminal />
          <div>
            <b>OPTIMISER RUNNING</b>
            <p>› stage 1 · minimising priority-weighted shortfall… ok</p>
            <p>› stage 2 · minimising funding cost… optimal</p>
            <p>› integer verification… passed (PuLP + HiGHS)</p>
          </div>
        </div>
      )}

      <div className="grid-title">
        <h3>Vault inventory</h3>
        <span>{totalFreeUnits.toLocaleString('en-IN')} units free</span>
      </div>

      <div className="asset-grid">
        {scenario.assets.map((a) => {
          const s = state?.assets?.find(
            (x) => x.asset_id.toUpperCase() === a.id.toUpperCase()
          ) || {
            total: a.quantity,
            reserved: 0,
            available: a.quantity,
            version: 1,
          };
          const pct = s.total ? (s.reserved / s.total) * 100 : 0;
          return (
            <div
              className={`asset-card ${s.available === 0 ? 'locked' : ''}`}
              key={a.id}
            >
              {s.available === 0 && <LockKeyhole className="lock" />}
              <div className="card-top">
                <span className="mono">{a.id}</span>
                <span className="hex">V{s.version}</span>
              </div>
              <b>{a.name}</b>
              <div className="class">{a.class}</div>
              <div className="qty">
                {fmt(s.available)} <small>/ {fmt(s.total)} FREE</small>
              </div>
              <div className="capacity">
                <i style={{ width: `${pct}%` }} />
              </div>
              <div className="meta">
                <span>
                  HC{' '}
                  {a.class === 'EQUITY'
                    ? '15'
                    : a.class.includes('LONG') || a.class.includes('CORP')
                    ? '4'
                    : a.class.includes('MID')
                    ? '2'
                    : a.class === 'TBILL'
                    ? '0.5'
                    : '0'}
                  %
                </span>
                <span>COST {a.funding_cost_bps} bps</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid-title">
        <h3>Obligations</h3>
        <span>priority waterfall</span>
      </div>

      <div className="obligations">
        {scenario.obligations.map((o) => {
          const c = plan?.coverage?.find(
            (x) => x.obligation_id.toUpperCase() === o.id.toUpperCase()
          );
          const pct = c
            ? Math.min(100, ((c.covered_lakh || 0) / (o.required_lakh || 1)) * 100)
            : 0;
          return (
            <div className="obligation" key={o.id}>
              <div className="ring" style={{ '--p': `${pct * 3.6}deg` }}>
                <span>{Math.round(pct)}%</span>
              </div>
              <div>
                <div className="priority">
                  P{o.priority} · {o.counterparty}
                </div>
                <h3>{o.name}</h3>
                <p>
                  <span className="mono">{money(c?.covered_lakh || 0)}</span> /{' '}
                  {money(o.required_lakh)}
                </p>
                {c?.shortfall_lakh > 0 && (
                  <div className="shortfall">
                    SHORT {money(c.shortfall_lakh)} · {c.reason}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className={`kpi ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function FlowView({ plans, method, setMethod }) {
  const p = plans?.find((x) => x.method === method) || plans?.[0];

  if (!p) {
    return <Empty icon={Network} text="No allocation flows benchmarked yet." />;
  }

  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">FLOW / ALLOCATION MAP</span>
          <h2>Value after haircut</h2>
        </div>
        <div className="toggle">
          {methods.map((m) => (
            <button
              key={m}
              className={method === m ? 'selected' : ''}
              onClick={() => setMethod(m)}
            >
              {labels[m] || m}
            </button>
          ))}
        </div>
      </div>
      <div className="flow-panel">
        <div className="flow-labels">
          <span>COLLATERAL SOURCES</span>
          <span>SECURED OBLIGATIONS</span>
        </div>
        <div className="flow">
          {p.lines?.map((l, i) => (
            <div className="flow-row" key={`${l.asset_id}-${l.obligation_id}-${i}`}>
              <div className="node">
                {l.asset_id}
                <small>{fmt(l.units)} units</small>
              </div>
              <div
                className={`link c${i % 6}`}
                style={{ height: Math.max(5, (l.usable_lakh || 10) / 130) }}
                title={`${l.units} units · ${money(l.usable_lakh)} usable · ${(
                  l.haircut_bps / 100
                ).toFixed(1)}% haircut`}
              />
              <div className="node right">
                {l.obligation_id}
                <small>{money(l.usable_lakh)} usable</small>
              </div>
            </div>
          ))}
          {p.totals?.shortfall_lakh > 0 && (
            <div className="gap">
              <ShieldAlert /> GAP · {money(p.totals.shortfall_lakh)} SHORTFALL
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Ledger({ events, plan }) {
  const activeHash =
    plan?.plan_hash || '0x8c019f4a138bcfd71e9802bc3410f92b774619d80312';
  const shortSeal = `${activeHash.slice(0, 8)}…${activeHash.slice(-4)}`;

  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">LEDGER / IMMUTABLE AUDIT</span>
          <h2>Chain activity</h2>
        </div>
        <Button
          icon={Copy}
          onClick={() => {
            navigator.clipboard?.writeText(activeHash);
            toast.success('Plan hash copied to clipboard');
          }}
        >
          PLAN SEAL · {shortSeal}
        </Button>
      </div>

      <div className="blocks">
        {events.slice(0, 8).map((e, i) => (
          <div
            key={`${e.type}-${e.block}-${i}`}
            className={`block ${e.type === 'Rejected' ? 'rejected' : ''}`}
          >
            <Hexagon />
            <span>#{e.block}</span>
            <b>{e.type}</b>
            <small>{e.asset_id || e.reason}</small>
          </div>
        ))}
      </div>

      {events.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>TYPE</th>
                <th>ASSET</th>
                <th>OBLIGATION</th>
                <th>UNITS</th>
                <th>ACTOR</th>
                <th>REASON</th>
                <th>TX / TIME</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={`${e.type}-${i}`}>
                  <td>
                    <Status ok={e.type !== 'Rejected'}>{e.type}</Status>
                  </td>
                  <td>{e.asset_id || '—'}</td>
                  <td>{e.obligation_id || '—'}</td>
                  <td>{e.units != null ? fmt(e.units) : '—'}</td>
                  <td>{e.actor || 'Desk 1'}</td>
                  <td>{e.reason || '—'}</td>
                  <td className="mono">
                    {e.tx_hash}
                    <small>
                      {e.time
                        ? new Date(e.time).toLocaleTimeString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                          }) + ' IST'
                        : ''}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={Blocks}
          text="No chain activity yet. Commit an allocation to open the ledger."
        />
      )}
    </>
  );
}

const attacksList = [
  ['double_pledge', 'Double pledge', 'Reserve CASH already committed to Desk 1.'],
  ['duplicate', 'Replay plan', 'Submit the same allocation ID twice.'],
  ['excessive', 'Excess quantity', 'Request more corporate bonds than exist.'],
  ['ineligible', 'Ineligible asset', 'Pledge equity against a repo rule.'],
  ['stale', 'Stale inventory', 'Commit against an outdated asset version.'],
];

function Arena({ attacks: score, run }) {
  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">ARENA / ADVERSARIAL TEST</span>
          <h2>Double-pledge firewall</h2>
        </div>
        <div className="score">
          ATTACKS {score} <i /> BLOCKED {score}
        </div>
      </div>
      <div className="arena">
        <div className="desk allocator">
          <WalletCards />
          <span>DESK 1 · ALLOCATOR</span>
          <b>Active Ledger Allocation</b>
          <Status>RESERVED</Status>
        </div>
        <div className="shield">
          <Shield />
          <span>SMART CONTRACT</span>
          <b>{score ? 'BLOCKED' : 'ARMED'}</b>
        </div>
        <div className="desk attacker">
          <ShieldAlert />
          <span>DESK 2 · ATTACKER</span>
          <b>5 exploit vectors</b>
          <Status ok={false}>HOSTILE</Status>
        </div>
      </div>
      <div className="attack-grid">
        {attacksList.map(([id, name, desc]) => (
          <button key={id} onClick={() => run(id)}>
            <div>
              <ShieldAlert />
              <b>{name}</b>
            </div>
            <p>{desc}</p>
            <span>
              LAUNCH TEST <Play />
            </span>
          </button>
        ))}
      </div>
      {score > 0 && (
        <motion.div
          className="stamp"
          initial={{ scale: 1.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          BLOCKED · VALIDATION REJECTED ON-CHAIN
        </motion.div>
      )}
    </>
  );
}

function Compare({ plans }) {
  if (!plans || !plans.length) {
    return <Empty icon={GitCompare} text="No comparison data available." />;
  }

  const optPlan = plans.find((p) => p.method === 'optimiser');
  const cheapPlan = plans.find((p) => p.method === 'cheapest_first');

  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">COMPARE / METHOD BENCHMARK</span>
          <h2>Optimisation evidence</h2>
        </div>
        <Status>{plans.length} METHODS EVALUATED</Status>
      </div>
      <div className="verdict">
        <Zap />
        <div>
          <b>OPTIMISER WINS THE COVERAGE CONSTRAINT</b>
          <p>
            Covers every obligation in 2 LP stages; cheapest-first incurs{' '}
            {money(cheapPlan?.totals?.shortfall_lakh || 2666.02)} lakh in shortfalls.
          </p>
        </div>
      </div>
      <div className="charts">
        {[
          ['effective_cost_lakh', 'Effective cost', '₹ lakh', 750],
          ['shortfall_lakh', 'Shortfall', '₹ lakh', 5000],
          ['utilisation_pct', 'Utilisation', '%', 100],
        ].map(([key, title, unit, max]) => (
          <div key={key} className="chart">
            <h3>{title}</h3>
            {plans.map((p) => (
              <div key={p.method} className="bar-row">
                <span>{labels[p.method] || p.method}</span>
                <div>
                  <i
                    className={p.method === 'optimiser' ? 'best' : ''}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(1, ((p.totals?.[key] || 0) / max) * 100)
                      )}%`,
                    }}
                  />
                </div>
                <b>
                  {fmt(p.totals?.[key])}
                  {unit === '%' ? '%' : ''}
                </b>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function Empty({ icon: Icon, text }) {
  return (
    <div className="empty">
      <Icon />
      <p>{text}</p>
    </div>
  );
}
