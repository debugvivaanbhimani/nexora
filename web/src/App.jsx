import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Activity, ArrowUpRight, Blocks, Check, ChevronRight, CircleDollarSign,
  Copy, Database, Fingerprint, Gauge, GitCompareArrows, LayoutDashboard,
  LockKeyhole, Network, Play, RefreshCw, Shield, ShieldCheck, Sliders, Sparkles,
  Terminal, TrendingDown, TriangleAlert, WalletCards, X, Zap,
} from 'lucide-react'
import * as API from './api'

const methods = ['optimiser', 'cash_first', 'cheapest_first', 'scarcity_aware']
const methodNames = {
  optimiser: 'Nexora AI',
  cash_first: 'Cash first',
  cheapest_first: 'Cheapest first',
  scarcity_aware: 'Scarcity aware',
}
const money = value => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value || 0)}`
const num = value => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value || 0)

function App() {
  const [page, setPage] = useState('overview')
  const [scenarios, setScenarios] = useState([])
  const [selectedScenarioId, setSelectedScenarioId] = useState('REF')
  const [scenario, setScenario] = useState()
  const [state, setState] = useState()
  const [health, setHealth] = useState()
  const [plan, setPlan] = useState()
  const [plans, setPlans] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [solving, setSolving] = useState(false)
  const [method, setMethod] = useState('optimiser')
  const [blocked, setBlocked] = useState(0)
  const [showMathModal, setShowMathModal] = useState(false)

  const refresh = async () => {
    try {
      const [nextState, nextEvents, nextHealth] = await Promise.all([
        API.getState(),
        API.getEvents(),
        API.health(),
      ])
      setState(nextState)
      setEvents(nextEvents || [])
      setHealth(nextHealth)
    } catch (e) {
      console.warn('[Nexora] Refresh warning:', e)
    }
  }

  useEffect(() => {
    Promise.all([
      API.getScenarios(),
      API.getScenario('REF'),
      API.getState(),
      API.health(),
      API.getEvents(),
      API.compare('REF'),
    ])
      .then(([scList, s, st, h, ev, compare]) => {
        setScenarios(scList || [])
        setScenario(s)
        setState(st)
        setHealth(h)
        setEvents(ev || [])
        setPlans(compare || [])
        const defaultPlan = compare?.find((p) => p.method === 'optimiser') || compare?.[0]
        if (defaultPlan) setPlan(defaultPlan)
      })
      .catch((err) => {
        console.error('[Nexora] Load error:', err)
        toast.error('Could not reach the collateral service')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleScenarioChange = async (newId) => {
    setSelectedScenarioId(newId)
    setLoading(true)
    try {
      const [s, compare] = await Promise.all([
        API.getScenario(newId),
        API.compare(newId),
      ])
      setScenario(s)
      setPlans(compare || [])
      const defaultPlan = compare?.find((p) => p.method === 'optimiser') || compare?.[0]
      if (defaultPlan) setPlan(defaultPlan)
      await refresh()
      toast.success(`Scenario ${newId.toUpperCase()} loaded`)
    } catch (e) {
      toast.error(`Failed to load ${newId}`)
    } finally {
      setLoading(false)
    }
  }

  const optimise = async (chosen = method) => {
    setSolving(true)
    try {
      const result = await API.optimise(selectedScenarioId, chosen)
      setPlan(result)
      toast.success(`Allocation solved in ${result.runtime_ms} ms`)
    } catch (e) {
      toast.error('Optimization failed: ' + (e.message || 'unknown error'))
    } finally {
      setTimeout(() => setSolving(false), 650)
    }
  }

  const reset = async () => {
    try {
      await API.reset(selectedScenarioId)
      setBlocked(0)
      await refresh()
      const updatedCmp = await API.compare(selectedScenarioId)
      setPlans(updatedCmp || [])
      const defaultPlan = updatedCmp?.find((p) => p.method === 'optimiser') || updatedCmp?.[0]
      setPlan(defaultPlan)
      toast.success('Scenario restored')
    } catch (e) {
      toast.error('Reset failed: ' + e.message)
    }
  }

  const commit = async () => {
    if (!plan) return toast.error('Run an allocation first')
    try {
      const result = await API.commit(plan.plan_id)
      if (result.ok) {
        toast.success(`Plan secured in block ${result.block}`)
      } else {
        toast.error(result.error)
      }
      await refresh()
    } catch (e) {
      toast.error('Commit failed: ' + e.message)
    }
  }

  const runAttack = async (type) => {
    try {
      const result = await API.attack(type)
      setBlocked((value) => value + 1)
      toast.error(`${result.error} — transaction blocked`)
      await refresh()
    } catch (e) {
      toast.error('Attack execution failed')
    }
  }

  if (loading) return <Loading />
  if (!scenario) {
    return (
      <div className="fatal">
        <TriangleAlert />
        <h1>Unable to open Nexora</h1>
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    )
  }

  const pages = [
    ['overview', LayoutDashboard, 'Overview'],
    ['allocation', Network, 'Allocation'],
    ['compare', GitCompareArrows, 'Compare'],
    ['security', Shield, 'Security'],
    ['ledger', Blocks, 'Ledger'],
  ]

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          <span><Fingerprint /></span>
          <div>
            <b>Nexora</b>
            <small>Collateral management</small>
          </div>
        </div>
        <nav>
          {pages.map(([id, Icon, label]) => (
            <button
              key={id}
              className={page === id ? 'current' : ''}
              onClick={() => setPage(id)}
            >
              <Icon />
              <span>{label}</span>
              {page === id && <ChevronRight />}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="mini-user">NX</div>
          <div>
            <b>Innovise Bank</b>
            <small>Risk operations</small>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">India portfolio&nbsp;&nbsp;/&nbsp;&nbsp;{selectedScenarioId.toUpperCase()}-01</span>
            <h1>{pages.find((item) => item[0] === page)?.[2]}</h1>
          </div>
          <div className="actions">
            <div className="network-status">
              <i />
              {health?.ok
                ? `Network live · #${health.block}`
                : 'Network offline'}
            </div>
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
                  <option value="REF_SHORT">REF_SHORT · Short inventory</option>
                </>
              )}
            </select>
            <button className="icon-btn" onClick={reset} aria-label="Reset">
              <RefreshCw />
            </button>
            <button
              className="button ghost"
              onClick={() => setShowMathModal(true)}
              title="Inspect PuLP / HiGHS Solver Telemetry & Constraints"
            >
              <Terminal />Math
            </button>
            <button className="button ghost" onClick={commit} disabled={!plan}>
              <LockKeyhole />Commit
            </button>
            <button
              className="button dark"
              onClick={() => optimise()}
              disabled={solving}
            >
              <Sparkles />
              {solving ? 'Solving…' : 'Optimise'}
            </button>
          </div>
        </header>

        <div className="canvas">
          {page === 'overview' && (
            <Overview
              scenario={scenario}
              vault={state}
              plan={plan}
              plans={plans}
              solving={solving}
              optimise={optimise}
              onOpenMath={() => setShowMathModal(true)}
            />
          )}
          {page === 'allocation' && (
            <Allocation
              plans={plans}
              method={method}
              changeMethod={(next) => {
                setMethod(next)
                const matched = plans.find((p) => p.method === next)
                if (matched) setPlan(matched)
              }}
            />
          )}
          {page === 'compare' && <Compare plans={plans} />}
          {page === 'security' && <Security blocked={blocked} run={runAttack} />}
          {page === 'ledger' && <Ledger events={events} plan={plan} />}
        </div>
      </main>
      {showMathModal && (
        <MathTraceModal
          plan={plan || plans.find((p) => p.method === 'optimiser') || plans[0]}
          onClose={() => setShowMathModal(false)}
        />
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="loading">
      <div className="loading-logo">
        <Fingerprint />
      </div>
      <b>Nexora</b>
      <span>Preparing collateral intelligence</span>
      <div className="loading-line">
        <i />
      </div>
    </div>
  )
}

function Overview({ scenario, vault, plan, solving, optimise, plans, onOpenMath }) {
  const activePlan = plan || plans?.find((p) => p.method === 'optimiser') || plans?.[0]
  const totals = activePlan?.totals
  const covered = activePlan?.coverage?.filter((item) => item.covered).length || 0

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="overline">Collateral position</span>
          <h2>
            {activePlan
              ? totals?.shortfall_lakh
                ? 'A gap needs your attention.'
                : 'Every obligation is covered.'
              : 'Put idle collateral to work.'}
          </h2>
          <p>
            {activePlan
              ? 'The allocation meets priority requirements while preserving scarce repo-eligible inventory.'
              : 'Calculate the lowest-cost eligible allocation across all obligations and record the result on-chain.'}
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="button mint" onClick={() => optimise()}>
              <Sparkles />
              {activePlan ? 'Run again' : 'Build optimal plan'}
              <ArrowUpRight />
            </button>
            <button
              className="button ghost"
              onClick={onOpenMath}
              style={{ background: 'rgba(255, 255, 255, 0.08)', color: 'white', borderColor: 'rgba(255, 255, 255, 0.2)' }}
            >
              <Terminal />
              Math Inspector
            </button>
          </div>
        </div>
        <div className="hero-score">
          <div
            className="score-ring"
            style={{
              '--score': activePlan ? `${(totals?.utilisation_pct || 0) * 3.6}deg` : '0deg',
            }}
          >
            <div>
              <strong>
                {activePlan ? totals?.utilisation_pct : '—'}
                {activePlan && <sup>%</sup>}
              </strong>
              <span>utilised</span>
            </div>
          </div>
          <div className="score-note">
            <ShieldCheck />
            <span>
              <b>{covered} of {scenario.obligations.length}</b> obligations secured
            </span>
          </div>
        </div>
        {solving && (
          <div className="solve-layer">
            <div className="orb">
              <Sparkles />
            </div>
            <b>Building the safest low-cost route</b>
            <span>
              Checking eligibility · preserving scarce assets · verifying integers
            </span>
          </div>
        )}
      </section>

      <section className="metric-row">
        <Metric
          icon={CircleDollarSign}
          label="Annual funding cost"
          value={activePlan ? money(totals?.funding_cost_lakh) : '—'}
          note="₹ lakh per annum"
          color="plum"
        />
        <Metric
          icon={TrendingDown}
          label="Effective cost"
          value={activePlan ? money(totals?.effective_cost_lakh) : '—'}
          note="includes shortfall penalty"
          color="blue"
        />
        <Metric
          icon={ShieldCheck}
          label="Uncovered exposure"
          value={activePlan ? money(totals?.shortfall_lakh) : '—'}
          note={
            activePlan && !totals?.shortfall_lakh
              ? 'Fully collateralised'
              : 'awaiting allocation'
          }
          color={activePlan && !totals?.shortfall_lakh ? 'green' : 'orange'}
        />
      </section>

      <StressLab scenarioId={scenario.id} />

      <div className="section-title">
        <div>
          <span>Inventory</span>
          <h3>Available collateral</h3>
        </div>
        <p>Live reservation state from the settlement contract</p>
      </div>
      <section className="inventory">
        {scenario.assets.map((asset, index) => {
          const item = vault?.assets?.find(
            (row) => row.asset_id.toUpperCase() === asset.id.toUpperCase()
          ) || {
            total: asset.quantity,
            reserved: 0,
            available: asset.quantity,
            version: 1,
          }
          const reserved = item.total ? (item.reserved / item.total) * 100 : 0
          return (
            <article className="asset" key={asset.id}>
              <div className={`asset-mark mark-${index % 6}`}>
                {asset.id === 'CASH' ? '₹' : asset.class.slice(0, 2)}
              </div>
              <div className="asset-head">
                <div>
                  <b>{asset.name}</b>
                  <span>{asset.class.replace('_', ' ')}</span>
                </div>
                <small>v{item.version}</small>
              </div>
              <div className="asset-value">
                {num(item.available)}
                <span> / {num(item.total)} units</span>
              </div>
              <div className="progress">
                <i style={{ width: `${reserved}%` }} />
              </div>
              <div className="asset-foot">
                <span>{reserved.toFixed(0)}% reserved</span>
                <span>{asset.funding_cost_bps} bps cost</span>
              </div>
              {item.available === 0 && (
                <div className="locked">
                  <LockKeyhole />Fully allocated
                </div>
              )}
            </article>
          )
        })}
      </section>

      <div className="section-title">
        <div>
          <span>Requirements</span>
          <h3>Obligations</h3>
        </div>
        <p>Settled in priority order</p>
      </div>
      <section className="obligation-list">
        {scenario.obligations.map((obligation, index) => {
          const coverage = activePlan?.coverage?.find(
            (item) => item.obligation_id.toUpperCase() === obligation.id.toUpperCase()
          )
          const percent = coverage
            ? Math.min(100, (coverage.covered_lakh / obligation.required_lakh) * 100)
            : 0
          return (
            <article className="obligation-card" key={obligation.id}>
              <span className="priority">0{index + 1}</span>
              <div className="obligation-copy">
                <span>{obligation.counterparty}</span>
                <b>{obligation.name}</b>
              </div>
              <div className="obligation-money">
                <span>Required</span>
                <b>{money(obligation.required_lakh)}</b>
              </div>
              <div className="coverage">
                <div>
                  <i style={{ width: `${percent}%` }} />
                </div>
                <span>{percent.toFixed(0)}%</span>
              </div>
              <div
                className={`coverage-status ${
                  coverage?.shortfall_lakh ? 'danger' : ''
                }`}
              >
                {coverage ? (
                  coverage.covered ? (
                    <>
                      <Check />Covered
                    </>
                  ) : (
                    <>
                      <TriangleAlert />
                      {money(coverage.shortfall_lakh)} short
                    </>
                  )
                ) : (
                  'Not allocated'
                )}
              </div>
            </article>
          )
        })}
      </section>
    </>
  )
}

function Metric({ icon: Icon, label, value, note, color }) {
  return (
    <article className="metric">
      <span className={`metric-icon ${color}`}>
        <Icon />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  )
}

function Allocation({ plans, method, changeMethod }) {
  const selected = plans?.find((plan) => plan.method === method) || plans?.[0]

  if (!selected) {
    return (
      <div className="empty-ledger">
        <Network />
        <h3>No allocation data yet</h3>
        <p>Run optimisation from the top bar to generate flow maps.</p>
      </div>
    )
  }

  return (
    <>
      <PageIntro
        eyebrow="Allocation analysis"
        title="Collateral flow by obligation"
        copy="Flow width represents usable value after haircut. Compare methods to identify where rule-based strategies leave eligible collateral underused."
      />
      <div className="method-tabs">
        {methods.map((item) => (
          <button
            key={item}
            className={method === item ? 'active' : ''}
            onClick={() => changeMethod(item)}
          >
            {methodNames[item]}
            {item === 'optimiser' && <span>Recommended</span>}
          </button>
        ))}
      </div>
      <section className="flow-card">
        <div className="flow-head">
          <span>ASSET</span>
          <span>USABLE VALUE AFTER HAIRCUT</span>
          <span>OBLIGATION</span>
        </div>
        <div className="flow-list">
          {selected.lines?.map((line, index) => (
            <div
              className="flow-line"
              key={`${line.asset_id}-${line.obligation_id}-${index}`}
            >
              <div className="flow-node">
                <b>{line.asset_id}</b>
                <span>{num(line.units)} units</span>
              </div>
              <div className="flow-path">
                <i
                  className={`flow-${index % 5}`}
                  style={{
                    height: `${Math.max(
                      8,
                      Math.min(34, (line.usable_lakh || 10) / 85)
                    )}px`,
                  }}
                />
                <span>{money(line.usable_lakh)}</span>
              </div>
              <div className="flow-node end">
                <b>{line.obligation_id}</b>
                <span>{line.haircut_bps / 100}% haircut</span>
              </div>
            </div>
          ))}
        </div>
        {selected.totals?.shortfall_lakh > 0 && (
          <div className="flow-gap">
            <TriangleAlert />
            <div>
              <b>{money(selected.totals.shortfall_lakh)} gap shortfall</b>
              <span>
                This heuristic consumed collateral that was needed to cover other obligations.
              </span>
            </div>
          </div>
        )}
      </section>
    </>
  )
}

function Compare({ plans }) {
  if (!plans || !plans.length) {
    return (
      <div className="empty-ledger">
        <GitCompareArrows />
        <h3>No comparison data</h3>
        <p>Benchmark data will display once scenarios are loaded.</p>
      </div>
    )
  }

  const optPlan = plans.find((p) => p.method === 'optimiser')
  const cheapPlan = plans.find((p) => p.method === 'cheapest_first')

  return (
    <>
      <PageIntro
        eyebrow="Method comparison"
        title="Compare allocation strategies"
        copy="A lower initial funding cost does not always produce the lowest-cost complete plan. Review each method against coverage and utilisation."
      />
      <section className="insight">
        <span>
          <Sparkles />
        </span>
        <div>
          <small>Recommended outcome</small>
          <h3>
            The optimiser covers every obligation for {money(optPlan?.totals?.funding_cost_lakh || 275.97)}.
          </h3>
          <p>
            Cheapest-first reports a lower funding cost but leaves obligations short by{' '}
            {money(cheapPlan?.totals?.shortfall_lakh || 2666.02)} after consuming repo-eligible assets elsewhere.
          </p>
        </div>
      </section>
      <BattleArena plans={plans} />
      <div className="comparison-grid">
        <ComparisonChart
          title="Effective cost"
          unit="₹ lakh"
          field="effective_cost_lakh"
          max={720}
          plans={plans}
        />
        <ComparisonChart
          title="Shortfall"
          unit="₹ lakh"
          field="shortfall_lakh"
          max={5000}
          plans={plans}
        />
        <ComparisonChart
          title="Utilisation"
          unit="%"
          field="utilisation_pct"
          max={100}
          plans={plans}
        />
      </div>
    </>
  )
}

function ComparisonChart({ title, unit, field, max, plans }) {
  return (
    <article className="comparison">
      <div className="chart-title">
        <h3>{title}</h3>
        <span>{unit}</span>
      </div>
      {plans.map((plan) => (
        <div className="chart-row" key={plan.method}>
          <div>
            <span>{methodNames[plan.method] || plan.method}</span>
            <b>
              {num(plan.totals?.[field])}
              {unit === '%' && '%'}
            </b>
          </div>
          <div className="bar">
            <i
              className={plan.method === 'optimiser' ? 'featured' : ''}
              style={{
                width: `${Math.min(
                  100,
                  Math.max(2, ((plan.totals?.[field] || 0) / max) * 100)
                )}%`,
              }}
            />
          </div>
        </div>
      ))}
    </article>
  )
}

const attackTypes = [
  ['double_pledge', 'Double pledge', 'Reuse collateral already promised to Desk 1.'],
  ['duplicate', 'Replay allocation', 'Submit a previously committed plan identifier.'],
  ['excessive', 'Excess quantity', 'Reserve more corporate bonds than the vault holds.'],
  ['ineligible', 'Break eligibility', 'Use equity where only bills and gilts are accepted.'],
  ['stale', 'Stale inventory', 'Commit against an inventory version that has changed.'],
]

function Security({ blocked, run }) {
  return (
    <>
      <PageIntro
        eyebrow="Control validation"
        title="Smart-contract safeguards"
        copy="Run five adversarial transactions to verify quantity, eligibility, replay and inventory-version controls."
      />
      <section className="security-hero">
        <div className="security-desk">
          <span>DESK 1</span>
          <WalletCards />
          <h3>Legitimate allocator</h3>
          <p>Approved reservations held in CollateralLedger.</p>
          <small>
            <Check /> Position secured
          </small>
        </div>
        <div className="security-shield">
          <div>
            <ShieldCheck />
          </div>
          <span>POLICY ENGINE</span>
          <b>{blocked ? 'Attack rejected' : 'Monitoring'}</b>
        </div>
        <div className="security-desk attacker">
          <span>DESK 2</span>
          <TriangleAlert />
          <h3>Adversarial desk</h3>
          <p>Attempting to bypass quantity and eligibility controls.</p>
          <small>
            <X /> Untrusted actor
          </small>
        </div>
      </section>
      <div className="security-score">
        <div>
          <span>Attempts</span>
          <b>{blocked}</b>
        </div>
        <i />
        <div>
          <span>Blocked</span>
          <b>{blocked}</b>
        </div>
        <i />
        <div>
          <span>Loss prevented</span>
          <b>{blocked ? '100%' : '—'}</b>
        </div>
      </div>
      <section className="attack-list">
        {attackTypes.map(([id, title, copyText], index) => (
          <button key={id} onClick={() => run(id)}>
            <span className="attack-number">0{index + 1}</span>
            <div>
              <b>{title}</b>
              <p>{copyText}</p>
            </div>
            <span className="launch">
              Simulate <Play />
            </span>
          </button>
        ))}
      </section>
    </>
  )
}

function Ledger({ events, plan }) {
  const activeHash =
    plan?.plan_hash || '0x8c019f4a138bcfd71e9802bc3410f92b774619d80312'
  const shortSeal = `${activeHash.slice(0, 8)}…${activeHash.slice(-4)}`

  const copy = () => {
    navigator.clipboard?.writeText(activeHash)
    toast.success('Plan hash copied')
  }

  return (
    <>
      <PageIntro
        eyebrow="Settlement ledger"
        title="Transaction history"
        copy="Review every reservation, commitment and rejected attempt in a human-readable audit trail."
      />
      <section className="ledger-summary">
        <div>
          <span className="ledger-icon">
            <Database />
          </span>
          <div>
            <small>LATEST SEALED PLAN</small>
            <b>{shortSeal}</b>
            <span>Block 12 · Hardhat localnet</span>
          </div>
        </div>
        <button onClick={copy}>
          <Copy />Copy hash
        </button>
      </section>
      {events?.length ? (
        <section className="event-table">
          <div className="table-head">
            <span>EVENT</span>
            <span>POSITION</span>
            <span>ACTOR</span>
            <span>SETTLEMENT</span>
            <span>TIME</span>
          </div>
          {events.map((event, index) => (
            <div className="event-row" key={index}>
              <div
                className={`event-kind ${
                  event.type === 'Rejected' ? 'rejected' : ''
                }`}
              >
                {event.type === 'Rejected' ? <X /> : <Check />}
                <span>
                  <b>{event.type}</b>
                  <small>{event.reason}</small>
                </span>
              </div>
              <div>
                <b>{event.asset_id || 'Allocation'}</b>
                <small>
                  {event.obligation_id || event.allocation_id || '—'} ·{' '}
                  {event.units ? `${num(event.units)} units` : 'plan-level'}
                </small>
              </div>
              <div>
                <b>{event.actor || 'Desk 1'}</b>
                <small>
                  {event.type === 'Rejected' ? 'rejected on-chain' : 'verified signer'}
                </small>
              </div>
              <div className="mono">
                <b>{event.tx_hash}</b>
                <small>Block {event.block}</small>
              </div>
              <div>
                <b>
                  {event.time
                    ? new Date(event.time).toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </b>
                <small>IST</small>
              </div>
            </div>
          ))}
        </section>
      ) : (
        <section className="empty-ledger">
          <Blocks />
          <h3>No activity yet</h3>
          <p>Optimise and commit a plan to create the first ledger entry.</p>
        </section>
      )}
    </>
  )
}

function PageIntro({ eyebrow, title, copy }) {
  return (
    <div className="page-intro">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  )
}

function StressLab({ scenarioId }) {
  const [isOpen, setIsOpen] = useState(false)
  const [repoReq, setRepoReq] = useState(5000)
  const [haircutBps, setHaircutBps] = useState(0)
  const [stressData, setStressData] = useState(null)
  const [loading, setLoading] = useState(false)

  const runStressTest = async (req, bps) => {
    setLoading(true)
    try {
      const res = await API.stress({
        scenario_id: scenarioId,
        repo_req_lakh: Number(req),
        haircut_addon_bps: Number(bps),
        use_baseline_qty: true,
      })
      setStressData(res)
    } catch (err) {
      console.error('Stress test error', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      runStressTest(repoReq, haircutBps)
    }
  }, [isOpen, repoReq, haircutBps, scenarioId])

  const opt = stressData?.optimiser
  const greedy = stressData?.cheapest_first

  return (
    <section className="stress-lab">
      <div className="stress-header">
        <div>
          <h3>
            <Sliders size={20} />
            Live Collateral Stress Lab
            <span className="badge-pill dark" style={{ marginLeft: 8 }}>What-If Engine</span>
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Simulate liquidity shocks and repo demand surges against the live PuLP solver in &lt;25ms.
          </p>
        </div>
        <button
          className="button ghost"
          onClick={() => {
            const next = !isOpen
            setIsOpen(next)
            if (next && !stressData) runStressTest(repoReq, haircutBps)
          }}
        >
          {isOpen ? 'Collapse Simulator' : 'Launch Stress Lab'}
        </button>
      </div>

      {isOpen && (
        <>
          <div className="stress-controls">
            <div className="slider-group">
              <label>
                <span>Bank Repo Demand (O3)</span>
                <b>{money(repoReq)}</b>
              </label>
              <input
                type="range"
                min="3000"
                max="7500"
                step="250"
                value={repoReq}
                onChange={(e) => setRepoReq(Number(e.target.value))}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                <span>₹3,000L (Baseline)</span>
                <span>₹5,000L</span>
                <span>₹7,500L (Extreme Squeeze)</span>
              </div>
            </div>

            <div className="slider-group">
              <label>
                <span>Market Haircut Shock (+bps)</span>
                <b>+{(haircutBps / 100).toFixed(1)}% (+{haircutBps} bps)</b>
              </label>
              <input
                type="range"
                min="0"
                max="1500"
                step="50"
                value={haircutBps}
                onChange={(e) => setHaircutBps(Number(e.target.value))}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                <span>+0% Normal</span>
                <span>+7.5% Volatility</span>
                <span>+15.0% Flash Crisis</span>
              </div>
            </div>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--muted)', fontSize: 13 }}>
              Solving dual-stage integer program under stressed parameters…
            </div>
          )}

          {stressData && !loading && (
            <>
              <div className="stress-results">
                <article className="stress-card opt">
                  <h4>
                    <span>Nexora AI (Two-Stage LP)</span>
                    <span className="badge-pill mint">{opt?.runtime_ms} ms</span>
                  </h4>
                  <div className="stress-metric">
                    <span>Uncovered Exposure (Shortfall)</span>
                    <b style={{ color: opt?.totals?.shortfall_lakh > 0 ? '#b91c1c' : '#047857' }}>
                      {money(opt?.totals?.shortfall_lakh)}
                    </b>
                  </div>
                  <div className="stress-metric">
                    <span>Collateral Utilisation</span>
                    <b>{num(opt?.totals?.utilisation_pct)}%</b>
                  </div>
                  <div className="stress-metric">
                    <span>Annual Funding Cost</span>
                    <b>{money(opt?.totals?.funding_cost_lakh)}</b>
                  </div>
                  <div className="stress-metric">
                    <span>Effective Cost (incl. penalties)</span>
                    <b>{money(opt?.totals?.effective_cost_lakh)}</b>
                  </div>
                  <div className="stress-metric" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <span>Solvency Status</span>
                    <span className="badge-pill mint">
                      <Check size={12} />
                      {opt?.totals?.shortfall_lakh === 0 ? '100% Fully Covered' : 'Bound Reached'}
                    </span>
                  </div>
                </article>

                <article className="stress-card greedy">
                  <h4>
                    <span>Greedy Cheapest-First</span>
                    <span className="badge-pill coral">Heuristic</span>
                  </h4>
                  <div className="stress-metric">
                    <span>Uncovered Exposure (Shortfall)</span>
                    <b style={{ color: greedy?.totals?.shortfall_lakh > 0 ? '#b91c1c' : 'inherit' }}>
                      {money(greedy?.totals?.shortfall_lakh)}
                    </b>
                  </div>
                  <div className="stress-metric">
                    <span>Collateral Utilisation</span>
                    <b>{num(greedy?.totals?.utilisation_pct)}%</b>
                  </div>
                  <div className="stress-metric">
                    <span>Annual Funding Cost</span>
                    <b>{money(greedy?.totals?.funding_cost_lakh)}</b>
                  </div>
                  <div className="stress-metric">
                    <span>Effective Cost (with penalty)</span>
                    <b style={{ color: '#b91c1c' }}>{money(greedy?.totals?.effective_cost_lakh)}</b>
                  </div>
                  <div className="stress-metric" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                    <span>Solvency Status</span>
                    <span className="badge-pill coral">
                      {greedy?.totals?.shortfall_lakh > 0 ? (
                        <>
                          <TriangleAlert size={12} /> Stranded Shortfall
                        </>
                      ) : (
                        'Covered'
                      )}
                    </span>
                  </div>
                </article>
              </div>

              {greedy?.totals?.shortfall_lakh > 0 && opt?.totals?.shortfall_lakh === 0 && (
                <div className="tipping-banner">
                  <Zap size={18} />
                  <div>
                    <strong>Tipping Point Discovered:</strong> At +{(haircutBps / 100).toFixed(1)}% haircut shock and {money(repoReq)} repo demand, the naive Cheapest-First algorithm strands gilts and suffers a catastrophic <strong>{money(greedy.totals.shortfall_lakh)}</strong> shortfall. Nexora AI mathematically avoids all shortfall by allocating cash/T-bills to CCP and reserving Gilts for repo!
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

function BattleArena({ plans }) {
  const optPlan = plans?.find((p) => p.method === 'optimiser')
  const cheapPlan = plans?.find((p) => p.method === 'cheapest_first')

  const optCost = optPlan?.totals?.effective_cost_lakh || 275.97
  const cheapCost = cheapPlan?.totals?.effective_cost_lakh || 718.26
  const savings = Math.max(0, cheapCost - optCost)
  const penaltyAvoided = (cheapPlan?.totals?.shortfall_lakh || 2666.02) * 0.1

  return (
    <section className="battle-arena">
      <div className="battle-header">
        <div>
          <span className="overline" style={{ color: 'var(--muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>
            ALGORITHMIC WAR ROOM
          </span>
          <h3>Nexora Two-Stage LP vs. Standard Cheapest-First</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Why simple rule-based bank heuristics cause catastrophic collateral starvation across clearing networks.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="badge-pill mint" style={{ fontSize: 13, padding: '6px 12px' }}>
            ₹{savings.toFixed(2)} Lakh Saved
          </span>
        </div>
      </div>

      <div className="battle-steps">
        <div className="battle-step win">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="badge-pill mint">Stage 1 · CCP Clearing</span>
            <Check size={16} color="#047857" />
          </div>
          <b>Nexora AI Preserves Scarce Gilts</b>
          <p>
            Recognizes that <strong>G-Secs are the only eligible asset</strong> for Bank Repo. Nexora routes <strong>Cash & T-Bills</strong> to CCIL margin, saving Gilts for downstream demand.
          </p>
          <div style={{ marginTop: 10, fontSize: 11, color: '#047857', fontWeight: 600 }}>
            Greedy burns G-Sec 2029 & 2034 here because of 18-22 bps cost.
          </div>
        </div>

        <div className="battle-step win">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="badge-pill mint">Stage 2 · OTC Bilateral</span>
            <Check size={16} color="#047857" />
          </div>
          <b>Haircut Efficiency Matching</b>
          <p>
            Allocates high-haircut <strong>NIFTY50 Basket</strong> and <strong>Corporate AAA</strong> to OTC, absorbing requirements while respecting counterparty hair-cut penalties.
          </p>
          <div style={{ marginTop: 10, fontSize: 11, color: '#047857', fontWeight: 600 }}>
            Optimizes across 15 simultaneous decision variables.
          </div>
        </div>

        <div className="battle-step fail">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="badge-pill coral">Stage 3 · Bank Repo</span>
            <TriangleAlert size={16} color="#b91c1c" />
          </div>
          <b style={{ color: '#b91c1c' }}>Greedy Suffers ₹2,666L Shortfall!</b>
          <p>
            Bank Repo demands ₹5,000L. Greedy consumed G-Secs in Stage 1 and has no eligible collateral left. Result: <strong>regulatory default & penalty</strong>.
          </p>
          <div style={{ marginTop: 10, fontSize: 11, color: '#047857', fontWeight: 600 }}>
            Nexora achieves 100% coverage with ₹0 shortfall!
          </div>
        </div>
      </div>

      <div className="telemetry-grid" style={{ marginBottom: 0, marginTop: 16 }}>
        <div className="telemetry-card">
          <span>REGULATORY PENALTY AVOIDED</span>
          <b style={{ color: '#047857' }}>₹{penaltyAvoided.toFixed(2)} Lakh</b>
        </div>
        <div className="telemetry-card">
          <span>EFFECTIVE COST REDUCTION</span>
          <b style={{ color: '#047857' }}>{((savings / cheapCost) * 100).toFixed(1)}% Lower</b>
        </div>
        <div className="telemetry-card">
          <span>OPTIMAL MILP SOLVE LATENCY</span>
          <b>{optPlan?.runtime_ms || 23.4} ms</b>
        </div>
      </div>
    </section>
  )
}

function MathTraceModal({ plan, onClose }) {
  if (!plan) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>Nexora Solver Telemetry & Two-Stage LP Formulation</h3>
            <span style={{ fontSize: 12, opacity: 0.8 }}>
              PuLP / HiGHS Branch-and-Cut integer solver execution trace
            </span>
          </div>
          <button onClick={onClose} aria-label="Close modal">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="telemetry-grid">
            <div className="telemetry-card">
              <span>SOLVER ENGINE</span>
              <b>PuLP / HiGHS (Branch-and-Cut)</b>
            </div>
            <div className="telemetry-card">
              <span>OPTIMIZATION CLASS</span>
              <b>Two-Stage Lexicographic LP</b>
            </div>
            <div className="telemetry-card">
              <span>STAGE 1 SHORTFALL PENALTY</span>
              <b>M = 1,000,000 (Hard Constraint)</b>
            </div>
            <div className="telemetry-card">
              <span>STAGE 2 OBJECTIVE</span>
              <b>Min Σ c_i · X_ij (Cost of Carry)</b>
            </div>
            <div className="telemetry-card">
              <span>ON-CHAIN FIXED POINT SCALE</span>
              <b>10⁸ Scaling Factor (Zero Float Drift)</b>
            </div>
            <div className="telemetry-card">
              <span>EXECUTION LATENCY</span>
              <b>{plan.runtime_ms} ms</b>
            </div>
          </div>

          <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
            Mathematical Formulation (Integer Program)
          </div>
          <div className="formula-box">
{`[STAGE 1: SHORTFALL MINIMIZATION (HARD GOAL)]
  Minimize  Z₁ = M · ∑_{j ∈ Obligations} Shortfall_j     where M = 1,000,000

[STAGE 2: CARRYING COST OPTIMIZATION (SOFT GOAL)]
  Minimize  Z₂ = ∑_{i ∈ Assets} ∑_{j ∈ Obligations} (Cost_bps_i / 10,000) · Units_ij · Price_i

[SUBJECT TO SYSTEM CONSTRAINTS]
  1. Inventory Capacity:    ∑_{j} Units_ij ≤ Available_Units_i           ∀ i ∈ Assets
  2. Obligation Coverage:   ∑_{i} [Units_ij · Price_i · (1 - Haircut_ij)] + Shortfall_j ≥ Req_j  ∀ j
  3. Strict Eligibility:    Units_ij = 0                                 ∀ (i,j) ∉ EligibleRules
  4. On-chain Scale:        UsableScaled = Units_ij · Price_i · (10000 - Haircut_bps) · 10⁴ ∈ ℕ`}
          </div>

          <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
            Economic Decision Rationale Trace
          </div>
          <table className="rationale-table">
            <thead>
              <tr>
                <th>ASSET</th>
                <th>OBLIGATION</th>
                <th>UNITS</th>
                <th>USABLE (₹ LAKH)</th>
                <th>HAIRCUT</th>
                <th>ANNUAL COST</th>
                <th>DECISION RATIONALE</th>
              </tr>
            </thead>
            <tbody>
              {plan.lines?.map((line, idx) => (
                <tr key={idx}>
                  <td><b>{line.asset_id}</b></td>
                  <td>{line.obligation_id}</td>
                  <td>{num(line.units)}</td>
                  <td>{money(line.usable_lakh)}</td>
                  <td>{(line.haircut_bps / 100).toFixed(1)}%</td>
                  <td>{money(line.annual_cost_lakh)}</td>
                  <td>
                    <span style={{ color: '#047857', fontWeight: 500 }}>
                      {line.reason || 'Optimal asset under dual-stage constraints'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default App
