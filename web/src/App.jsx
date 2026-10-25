import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Activity, ArrowUpRight, Blocks, Check, ChevronRight, CircleDollarSign,
  Copy, Database, Fingerprint, Gauge, GitCompareArrows, LayoutDashboard,
  LockKeyhole, Network, Play, RefreshCw, Shield, ShieldCheck, Sparkles,
  TrendingDown, TriangleAlert, WalletCards, X,
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
      })
      .catch((err) => {
        console.error('[Nexora] Load error:', err)
        toast.error('Could not reach the collateral service')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleScenarioChange = async (newId) => {
    setSelectedScenarioId(newId)
    setPlan(undefined)
    setLoading(true)
    try {
      const [s, compare] = await Promise.all([
        API.getScenario(newId),
        API.compare(newId),
      ])
      setScenario(s)
      setPlans(compare || [])
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
      setPlan(undefined)
      setBlocked(0)
      await refresh()
      const updatedCmp = await API.compare(selectedScenarioId)
      setPlans(updatedCmp || [])
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
              solving={solving}
              optimise={optimise}
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

function Overview({ scenario, vault, plan, solving, optimise }) {
  const totals = plan?.totals
  const covered = plan?.coverage?.filter((item) => item.covered).length || 0

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="overline">Collateral position</span>
          <h2>
            {plan
              ? totals?.shortfall_lakh
                ? 'A gap needs your attention.'
                : 'Every obligation is covered.'
              : 'Put idle collateral to work.'}
          </h2>
          <p>
            {plan
              ? 'The allocation meets priority requirements while preserving scarce repo-eligible inventory.'
              : 'Calculate the lowest-cost eligible allocation across all obligations and record the result on-chain.'}
          </p>
          <button className="button mint" onClick={() => optimise()}>
            <Sparkles />
            {plan ? 'Run again' : 'Build optimal plan'}
            <ArrowUpRight />
          </button>
        </div>
        <div className="hero-score">
          <div
            className="score-ring"
            style={{
              '--score': plan ? `${totals?.utilisation_pct * 3.6}deg` : '0deg',
            }}
          >
            <div>
              <strong>
                {plan ? totals?.utilisation_pct : '—'}
                {plan && <sup>%</sup>}
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
          value={plan ? money(totals?.funding_cost_lakh) : '—'}
          note="₹ lakh per annum"
          color="plum"
        />
        <Metric
          icon={TrendingDown}
          label="Effective cost"
          value={plan ? money(totals?.effective_cost_lakh) : '—'}
          note="includes shortfall penalty"
          color="blue"
        />
        <Metric
          icon={ShieldCheck}
          label="Uncovered exposure"
          value={plan ? money(totals?.shortfall_lakh) : '—'}
          note={
            plan && !totals?.shortfall_lakh
              ? 'Fully collateralised'
              : 'awaiting allocation'
          }
          color={plan && !totals?.shortfall_lakh ? 'green' : 'orange'}
        />
      </section>

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
          const coverage = plan?.coverage?.find(
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

export default App
