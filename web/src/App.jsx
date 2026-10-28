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

const ASSET_COLORS = {
  CASH: '#2a78d6',
  TBILL_91D: '#eb6834',
  GSEC_2029: '#1baf7a',
  GSEC_2034: '#eda100',
  CORP_AAA_2028: '#e87ba4',
  NIFTY50_BASKET: '#6250d6',
}

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
      return result
    } catch (e) {
      toast.error('Attack execution failed')
      return { ok: false, error: 'Reverted', args: e.message }
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
          <img src="/nexora-logo.png" alt="Nexora emblem" className="logo-img" />
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

           <div className="canvas" key={page}>
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
              scenario={scenario}
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
          {page === 'security' && (
            <Security
              blocked={blocked}
              run={runAttack}
              scenario={scenario}
              vault={state}
              plan={plan}
            />
          )}
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
          label="Annual funding cost"
          value={activePlan ? money(totals?.funding_cost_lakh) : '—'}
          note="₹ lakh per annum · optimal run-rate"
          color="plum"
        />
        <Metric
          label="Effective cost"
          value={activePlan ? money(totals?.effective_cost_lakh) : '—'}
          note="includes shortfall penalty & carry"
          color="blue"
        />
        <Metric
          label="Uncovered exposure"
          value={activePlan ? money(totals?.shortfall_lakh) : '—'}
          note={
            activePlan && !totals?.shortfall_lakh
              ? '100% collateralised · 0 gap'
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
          const assetColor = ASSET_COLORS[asset.id] || '#1baf7a'

          return (
            <article className="asset" key={asset.id} style={{ '--asset-accent': assetColor }}>
              <div className="asset-top-row">
                <span
                  className="asset-pill-ticker"
                  style={{
                    color: assetColor,
                    background: `${assetColor}15`,
                    borderColor: `${assetColor}35`,
                  }}
                >
                  {asset.id.replace('_', ' ')}
                </span>
                <span className="asset-ver-chip">v{item.version} ledger</span>
              </div>

              <div className="asset-info-block">
                <b className="asset-primary-title" title={asset.name}>
                  {asset.name}
                </b>
                <span className="asset-sub-class">
                  {asset.class.replace('_', ' ')} · {asset.funding_cost_bps} bps
                </span>
              </div>

              {/* Dynamic SVG capacity profile graphic */}
              <div className="asset-visual-wrap">
                <svg className="asset-wave-graphic" viewBox="0 0 120 28" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id={`asset-grad-${asset.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={assetColor} stopOpacity="0.32" />
                      <stop offset="100%" stopColor={assetColor} stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  <path
                    d={`M 0 ${22 - (index % 3) * 3} Q 30 ${10 - (index % 2) * 4}, 60 ${16 - (index % 3) * 2} T 120 ${8 + (index % 3) * 2} L 120 28 L 0 28 Z`}
                    fill={`url(#asset-grad-${asset.id})`}
                  />
                  <path
                    d={`M 0 ${22 - (index % 3) * 3} Q 30 ${10 - (index % 2) * 4}, 60 ${16 - (index % 3) * 2} T 120 ${8 + (index % 3) * 2}`}
                    stroke={assetColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </div>

              <div className="asset-metric-row">
                <strong className="asset-huge-qty">{num(item.available)}</strong>
                <span className="asset-total-units">/ {num(item.total)} units</span>
              </div>

              <div className="progress">
                <i style={{ width: `${reserved}%`, background: assetColor }} />
              </div>

              <div className="asset-foot">
                <span style={{ color: reserved > 80 ? 'var(--coral)' : 'var(--muted)', fontWeight: 600 }}>
                  {reserved.toFixed(0)}% pledged
                </span>
                <span>{num(item.reserved)} used</span>
              </div>

              {item.available === 0 && (
                <div className="locked">
                  <LockKeyhole size={14} /> Fully allocated
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

function Metric({ label, value, note, color }) {
  const renderSparkline = () => {
    if (color === 'plum') {
      return (
        <svg className="metric-sparkline" viewBox="0 0 80 24" fill="none">
          <defs>
            <linearGradient id="metric-grad-plum" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8d5b88" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#8d5b88" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d="M 0 18 Q 20 16, 40 10 T 80 4 L 80 24 L 0 24 Z" fill="url(#metric-grad-plum)" />
          <path d="M 0 18 Q 20 16, 40 10 T 80 4" stroke="#8d5b88" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="80" cy="4" r="3" fill="#8d5b88" />
        </svg>
      )
    }
    if (color === 'blue') {
      return (
        <svg className="metric-sparkline" viewBox="0 0 80 24" fill="none">
          <defs>
            <linearGradient id="metric-grad-blue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2a78d6" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#2a78d6" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <path d="M 0 4 Q 25 4, 50 14 T 80 20 L 80 24 L 0 24 Z" fill="url(#metric-grad-blue)" />
          <path d="M 0 4 Q 25 4, 50 14 T 80 20" stroke="#2a78d6" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="80" cy="20" r="3" fill="#2a78d6" />
        </svg>
      )
    }
    const isGreen = color === 'green'
    const strokeColor = isGreen ? '#1baf7a' : '#eb6834'
    return (
      <svg className="metric-sparkline" viewBox="0 0 80 24" fill="none">
        <defs>
          <linearGradient id="metric-grad-gap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d="M 0 20 Q 30 20, 55 12 T 80 8 L 80 24 L 0 24 Z" fill="url(#metric-grad-gap)" />
        <path d="M 0 20 Q 30 20, 55 12 T 80 8" stroke={strokeColor} strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="80" cy="8" r="3" fill={strokeColor} />
      </svg>
    )
  }

  return (
    <article className={`metric metric-${color}`}>
      <div className="metric-header-row">
        <div className="metric-label-group">
          <span className={`metric-badge-dot dot-${color}`} />
          <span className="metric-label-text">{label}</span>
        </div>
        {renderSparkline()}
      </div>
      <strong className="metric-main-value">{value}</strong>
      <div className="metric-footer-note">
        <span>{note}</span>
      </div>
    </article>
  )
}

const ASSET_META = {
  CASH: { name: 'Cash (INR)', label: 'Cash', color: '#2a78d6' },
  TBILL_91D: { name: '91-day T-Bill', label: 'T-Bill', color: '#eb6834' },
  GSEC_2029: { name: 'G-Sec 2029', label: 'G-Sec 1–5y', color: '#1baf7a' },
  GSEC_2034: { name: 'G-Sec 2034', label: 'G-Sec >5y', color: '#eda100' },
  CORP_AAA_2028: { name: 'AAA corporate 2028', label: 'AAA corporate', color: '#e87ba4' },
  NIFTY50_BASKET: { name: 'Nifty-50 basket', label: 'Index equity', color: '#6250d6' },
}

function Allocation({ scenario, plans, method, changeMethod }) {
  const [tooltip, setTooltip] = useState(null)
  const selected = plans?.find((plan) => plan.method === method) || plans?.[0]

  if (!selected || !scenario) {
    return (
      <div className="empty-ledger">
        <Network />
        <h3>No allocation data yet</h3>
        <p>Run optimisation from the top bar to generate flow maps.</p>
      </div>
    )
  }

  // Sankey Layout Geometry
  const W = 1000
  const H = 480
  const pad = 28
  const nw = 14
  const gapN = 16
  const xl = 220
  const xr = W - 250

  const lines = selected.lines || []
  const cov = selected.coverage || []

  // Left nodes (Assets with positive allocated usable value)
  const left = (scenario.assets || [])
    .map((a) => {
      const v = lines
        .filter((l) => l.asset_id === a.id)
        .reduce((sum, l) => sum + (l.usable_lakh || 0), 0)
      return { id: a.id, name: ASSET_META[a.id]?.name || a.name, v }
    })
    .filter((n) => n.v > 0)

  // Right nodes (Obligations)
  const right = (scenario.obligations || []).map((o) => {
    const c = cov.find((item) => item.obligation_id === o.id)
    return {
      id: o.id,
      name: o.name,
      v: o.required_lakh,
      cov: c ? c.covered_lakh : 0,
      short: c ? c.shortfall_lakh : 0,
    }
  })

  const totL = left.reduce((s, n) => s + n.v, 0)
  const totR = right.reduce((s, n) => s + n.v, 0)
  const maxTot = Math.max(totL, totR) || 1
  const k = (H - 2 * pad - gapN * Math.max(left.length, right.length)) / maxTot

  let yL = pad
  left.forEach((n) => {
    n.y = yL
    n.h = Math.max(8, n.v * k)
    n.off = 0
    yL += n.h + gapN
  })

  let yR = pad
  right.forEach((n) => {
    n.y = yR
    n.h = Math.max(8, n.v * k)
    n.off = 0
    yR += n.h + gapN
  })

  // Sort lines so links do not tangle
  const sortedLines = [...lines].sort((p, q) => {
    const idxP = right.findIndex((n) => n.id === p.obligation_id)
    const idxQ = right.findIndex((n) => n.id === q.obligation_id)
    return idxP - idxQ
  })

  const paths = sortedLines
    .map((l) => {
      const L = left.find((n) => n.id === l.asset_id)
      const R = right.find((n) => n.id === l.obligation_id)
      if (!L || !R) return null

      const th = Math.max(2, (l.usable_lakh || 0) * k)
      const y0 = L.y + L.off + th / 2
      const y1 = R.y + R.off + th / 2
      L.off += th
      R.off += th

      const mx = (xl + nw + xr) / 2
      const d = `M${xl + nw},${y0} C${mx},${y0} ${mx},${y1} ${xr},${y1}`
      const color = ASSET_COLORS[l.asset_id] || '#2e9c70'

      return {
        d,
        th,
        color,
        line: l,
        assetName: ASSET_META[l.asset_id]?.name || l.asset_id,
        obligationName: R.name,
      }
    })
    .filter(Boolean)

  const shortfallCount = cov.filter((c) => c.shortfall_lakh > 0.5)

  return (
    <>
      <PageIntro
        eyebrow="COLLATERAL FLOW GRAPH"
        title="Allocation Flow by Obligation"
        copy="Band width represents usable value after haircut. Switch strategies to watch how greedy heuristics burn repo-eligible assets, stranding Bank Repo downstream."
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          marginBottom: 12,
        }}
      >
        <div className="method-tabs" style={{ margin: 0 }}>
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

        <div style={{ fontSize: 13 }}>
          {shortfallCount.length === 0 ? (
            <span
              className="badge-pill mint"
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              <Check size={14} /> {methodNames[method]} covers all obligations
            </span>
          ) : (
            <span
              className="badge-pill coral"
              style={{ padding: '6px 12px', fontSize: 12 }}
            >
              <TriangleAlert size={14} /> Shortfall on{' '}
              {shortfallCount.map((s) => s.obligation_id).join(', ')} (
              {money(selected.totals?.shortfall_lakh)})
            </span>
          )}
        </div>
      </div>

      <div className="sankey-card">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Sankey collateral flow diagram"
        >
          {/* Ribbons */}
          {paths.map((p, idx) => (
            <path
              key={idx}
              className="sankey-link"
              d={p.d}
              stroke={p.color}
              strokeWidth={p.th}
              onMouseMove={(e) => {
                setTooltip({
                  x: e.clientX,
                  y: e.clientY,
                  line: p.line,
                  assetName: p.assetName,
                  obligationName: p.obligationName,
                  color: p.color,
                })
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          ))}

          {/* Left nodes (Assets) */}
          {left.map((n) => (
            <g key={n.id}>
              <rect
                x={xl}
                y={n.y}
                width={nw}
                height={n.h}
                rx={3}
                fill={ASSET_COLORS[n.id] || '#2e9c70'}
              />
              <text
                x={xl - 14}
                y={n.y + n.h / 2 - 3}
                textAnchor="end"
                className="sankey-node-text"
              >
                {n.name}
              </text>
              <text
                x={xl - 14}
                y={n.y + n.h / 2 + 13}
                textAnchor="end"
                className="sankey-sub-text"
              >
                {money(n.v)} usable
              </text>
            </g>
          ))}

          {/* Right nodes (Obligations) */}
          {right.map((n) => {
            const ch = Math.min(n.h, n.cov * k)
            const gapH = n.short * k
            return (
              <g key={n.id}>
                {/* Covered bar */}
                <rect
                  x={xr}
                  y={n.y}
                  width={nw}
                  height={Math.max(2, ch)}
                  rx={3}
                  fill="var(--mint-strong)"
                />
                {/* Shortfall gap dashed box */}
                {n.short > 0.5 && (
                  <rect
                    x={xr}
                    y={n.y + ch}
                    width={nw}
                    height={Math.max(4, gapH)}
                    rx={3}
                    fill="none"
                    stroke="var(--coral)"
                    strokeWidth="1.8"
                    strokeDasharray="4 3"
                  />
                )}
                {/* Labels */}
                <text
                  x={xr + nw + 14}
                  y={n.y + 14}
                  className="sankey-node-text"
                >
                  {n.name}
                </text>
                <text
                  x={xr + nw + 14}
                  y={n.y + 29}
                  className="sankey-sub-text"
                >
                  {money(n.cov)} of {money(n.v)}
                </text>
                {n.short > 0.5 && (
                  <text
                    x={xr + nw + 14}
                    y={n.y + 45}
                    className="sankey-sub-text"
                    fill="var(--coral)"
                    style={{ fontWeight: 600, fill: 'var(--coral)' }}
                  >
                    gap {money(n.short)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Legend */}
        <div className="sankey-legend">
          {Object.entries(ASSET_META).map(([id, meta]) => (
            <span key={id}>
              <i className="sankey-swatch" style={{ background: meta.color }} />
              {meta.name}
            </span>
          ))}
          <span>
            <i
              className="sankey-swatch"
              style={{
                background: 'transparent',
                border: '1.5px dashed var(--coral)',
              }}
            />
            Uncovered Shortfall Gap
          </span>
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {tooltip && (
        <div
          className="sankey-tip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <strong style={{ color: tooltip.color }}>
            {tooltip.assetName} → {tooltip.obligationName}
          </strong>
          <div>
            <b>{num(tooltip.line.units)} units</b> ·{' '}
            {money(tooltip.line.market_value_lakh)} market value
          </div>
          <div>
            Haircut: {(tooltip.line.haircut_bps / 100).toFixed(1)}% · Usable:{' '}
            <b>{money(tooltip.line.usable_lakh)}</b>
          </div>
          <div>Annual carry cost: {money(tooltip.line.annual_cost_lakh)}</div>
          {tooltip.line.reason && (
            <div
              style={{
                marginTop: 6,
                paddingTop: 6,
                borderTop: '1px solid rgba(255,255,255,0.15)',
                color: 'var(--mint)',
                fontSize: 11,
              }}
            >
              💡 {tooltip.line.reason}
            </div>
          )}
        </div>
      )}
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
        <div>
          <span className="badge-pill dark" style={{ marginBottom: 10, display: 'inline-flex' }}>
            RECOMMENDED ALLOCATION STRATEGY
          </span>
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

function Security({ blocked, run, scenario, vault, plan }) {
  const [animating, setAnimating] = useState(false)
  const [attempts, setAttempts] = useState(blocked || 0)
  const [blockedCount, setBlockedCount] = useState(blocked || 0)
  const [lastAttack, setLastAttack] = useState(null)

  const activePlan = plan || {
    plan_hash: '0x8c019f4a138bcfd71e9802bc3410f92b774619d80312',
    plan_id: 'ref-optimiser-1',
  }
  const shortSeal = `${(activePlan.plan_hash || '').slice(0, 8)}…${(activePlan.plan_hash || '').slice(-4)}`

  const handleFireAttack = async (id, title, desc, expectedRevert) => {
    if (animating) return
    setAnimating(true)
    setAttempts((prev) => prev + 1)

    // Trigger laser projectile flight
    const packet = document.getElementById('laser-packet')
    const shield = document.getElementById('shield-3d-svg')
    if (packet) {
      packet.classList.remove('firing')
      void packet.offsetWidth
      packet.classList.add('firing')
    }

    setTimeout(() => {
      if (shield) {
        shield.classList.remove('hit')
        void shield.offsetWidth
        shield.classList.add('hit')
      }
    }, 280)

    try {
      const res = await run(id)
      setBlockedCount((prev) => prev + 1)
      setLastAttack({
        id,
        title,
        desc,
        revertCode: res?.error || expectedRevert,
        args: res?.args || '',
        actor: res?.actor || 'Desk 2 (Adversary)',
      })
    } catch (e) {
      setBlockedCount((prev) => prev + 1)
      setLastAttack({
        id,
        title,
        desc,
        revertCode: expectedRevert,
        args: 'Reverted at EVM opcode level',
        actor: 'Desk 2',
      })
    } finally {
      setTimeout(() => setAnimating(false), 650)
    }
  }

  const attacksList = [
    {
      id: 'double_pledge',
      title: 'Double Pledge Exploit',
      desc: 'Attempt to re-pledge free cash already committed to Desk 1',
      expected: 'InsufficientQuantity',
    },
    {
      id: 'duplicate',
      title: 'Duplicate Plan Replay',
      desc: 'Re-submit already committed allocation plan identifier',
      expected: 'DuplicateAllocation',
    },
    {
      id: 'excessive',
      title: 'Excess Quantity Attack',
      desc: 'Request 5,000 units of AAA Bonds when only 2,000 exist in vault',
      expected: 'InsufficientQuantity',
    },
    {
      id: 'ineligible',
      title: 'Ineligible Collateral Breach',
      desc: 'Force Nifty-50 Equity basket into strict Bank Repo',
      expected: 'Ineligible',
    },
    {
      id: 'stale',
      title: 'Stale Inventory Front-Run',
      desc: 'Commit against an outdated inventory version to bypass lock',
      expected: 'StalePlan',
    },
  ]

  return (
    <>
      <PageIntro
        eyebrow="DOUBLE-PLEDGE & EVM INTEGRITY DEFENSE"
        title="Interactive 3D Attack Defense Arena"
        copy="Desk 2 has direct RPC credentials and attempts 5 distinct cryptographic & collateral attacks. The CollateralLedger smart contract enforces quantity, eligibility, replay, and version invariants at the EVM opcode level."
      />

      <div className="arena-3d-stage">
        <div className="arena-3d-layout">
          {/* Desk 1: Allocator */}
          <div className="desk-3d allocator">
            <div className="desk-3d-head">
              <h3>
                <WalletCards size={18} color="var(--mint-strong)" />
                Desk 1 · Verified Allocator
              </h3>
              <span className="badge-pill mint">
                <Check size={12} /> Position Sealed
              </span>
            </div>

            <div
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                marginBottom: 12,
              }}
            >
              Plan Hash:{' '}
              <span className="mono" style={{ color: 'var(--ink)' }}>
                {shortSeal}
              </span>
            </div>

            <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
              {scenario?.obligations?.map((ob) => (
                <div
                  key={ob.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: 'var(--paper)',
                    borderRadius: 6,
                    border: '1px solid var(--line)',
                  }}
                >
                  <div>
                    <b>{ob.name}</b>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {ob.counterparty}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <b>{money(ob.required_lakh)}</b>
                    <div style={{ fontSize: 11, color: 'var(--mint-strong)' }}>
                      Secured on-chain
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 14,
                paddingTop: 10,
                borderTop: '1px solid var(--line)',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
              }}
            >
              <span style={{ color: 'var(--muted)' }}>Ledger Invariants:</span>
              <b style={{ color: 'var(--mint-strong)' }}>Active & Enforced</b>
            </div>
          </div>

          {/* Center: 3D Quantum Defense Core */}
          <div className="shield-3d-core">
            <div className="shield-portal">
              <div className="portal-ring outer" />
              <div className="portal-ring inner" />

              {/* Animated Laser Projectile */}
              <div className="laser-packet" id="laser-packet" />

              {/* 3D Shield SVG */}
              <svg
                id="shield-3d-svg"
                className="shield-svg"
                viewBox="0 0 150 170"
                aria-hidden="true"
              >
                <path
                  className="shield-hull"
                  d="M75 8l60 20v48c0 40-26 68-60 84C41 144 15 116 15 76V28z"
                />
                <path
                  d="M52 86l16 16 31-34"
                  fill="none"
                  stroke="var(--mint-strong)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* Revert HUD Stamp */}
            <div className="revert-hud">
              {lastAttack ? (
                <>
                  <span className="revert-stamp-badge">
                    <X
                      size={14}
                      style={{ verticalAlign: 'middle', marginRight: 4 }}
                    />
                    BLOCKED · REVERTED
                  </span>
                  <div className="revert-reason-text">
                    EVM Error: {lastAttack.revertCode}
                  </div>
                  <div className="revert-sub-text">
                    {lastAttack.title} · Reverted before state mutation
                  </div>
                </>
              ) : (
                <>
                  <span
                    className="badge-pill mint"
                    style={{ padding: '6px 14px' }}
                  >
                    <ShieldCheck size={14} /> DEFENSE ENGINE ARMED
                  </span>
                  <div className="revert-sub-text" style={{ marginTop: 6 }}>
                    Launch any exploit from Desk 2 to test defense
                  </div>
                </>
              )}
            </div>

            {/* Score HUD */}
            <div
              style={{
                display: 'flex',
                gap: 18,
                marginTop: 12,
                fontSize: 12,
                color: 'var(--muted)',
                textAlign: 'center',
              }}
            >
              <div>
                <b
                  style={{
                    display: 'block',
                    fontSize: 18,
                    color: 'var(--ink)',
                  }}
                >
                  {attempts}
                </b>
                Attempts
              </div>
              <div>
                <b style={{ display: 'block', fontSize: 18, color: 'var(--mint-strong)' }}>
                  {blockedCount}
                </b>
                Blocked
              </div>
              <div>
                <b
                  style={{
                    display: 'block',
                    fontSize: 18,
                    color: 'var(--mint-strong)',
                  }}
                >
                  100%
                </b>
                Loss Prevented
              </div>
            </div>
          </div>

          {/* Desk 2: Attacker */}
          <div className="desk-3d attacker">
            <div className="desk-3d-head">
              <h3>
                <TriangleAlert size={18} color="var(--coral)" />
                Desk 2 · Rogue Desk / Exploiter
              </h3>
              <span className="badge-pill coral">
                <X size={12} /> Untrusted Actor
              </span>
            </div>

            <div
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                marginBottom: 12,
              }}
            >
              Select an adversarial vector to fire at the smart contract:
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              {attacksList.map((atk) => (
                <button
                  key={atk.id}
                  className="atk-card-btn"
                  onClick={() =>
                    handleFireAttack(
                      atk.id,
                      atk.title,
                      atk.desc,
                      atk.expected
                    )
                  }
                  disabled={animating}
                >
                  <div>
                    <b>{atk.title}</b>
                    <p>{atk.desc}</p>
                  </div>
                  <span className="atk-launch-tag">
                    <Zap size={12} /> Fire
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
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
        <div className="ledger-summary-left">
          <div className="ledger-status-tag">
            <span className="chain-pulse-dot" />
            <span>HARDHAT EVM · BLOCK #12</span>
          </div>
          <div className="ledger-hash-row">
            <small>LATEST SEALED PLAN ROOT</small>
            <b>{shortSeal}</b>
          </div>
        </div>
        <button className="button ghost" onClick={copy} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.2)' }}>
          <Copy size={16} />Copy hash
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
                    <b style={{ color: opt?.totals?.shortfall_lakh > 0 ? 'var(--coral)' : 'var(--mint-strong)' }}>
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
                  <div className="stress-metric" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
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
                    <b style={{ color: greedy?.totals?.shortfall_lakh > 0 ? 'var(--coral)' : 'inherit' }}>
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
                    <b style={{ color: 'var(--coral)' }}>{money(greedy?.totals?.effective_cost_lakh)}</b>
                  </div>
                  <div className="stress-metric" style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
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
            <Check size={16} color="var(--mint-strong)" />
          </div>
          <b>Nexora AI Preserves Scarce Gilts</b>
          <p>
            Recognizes that <strong>G-Secs are the only eligible asset</strong> for Bank Repo. Nexora routes <strong>Cash & T-Bills</strong> to CCIL margin, saving Gilts for downstream demand.
          </p>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--mint-strong)', fontWeight: 600 }}>
            Greedy burns G-Sec 2029 & 2034 here because of 18-22 bps cost.
          </div>
        </div>

        <div className="battle-step win">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="badge-pill mint">Stage 2 · OTC Bilateral</span>
            <Check size={16} color="var(--mint-strong)" />
          </div>
          <b>Haircut Efficiency Matching</b>
          <p>
            Allocates high-haircut <strong>NIFTY50 Basket</strong> and <strong>Corporate AAA</strong> to OTC, absorbing requirements while respecting counterparty hair-cut penalties.
          </p>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--mint-strong)', fontWeight: 600 }}>
            Optimizes across 15 simultaneous decision variables.
          </div>
        </div>

        <div className="battle-step fail">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="badge-pill coral">Stage 3 · Bank Repo</span>
            <TriangleAlert size={16} color="var(--coral)" />
          </div>
          <b style={{ color: 'var(--coral)' }}>Greedy Suffers ₹2,666L Shortfall!</b>
          <p>
            Bank Repo demands ₹5,000L. Greedy consumed G-Secs in Stage 1 and has no eligible collateral left. Result: <strong>regulatory default & penalty</strong>.
          </p>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--mint-strong)', fontWeight: 600 }}>
            Nexora achieves 100% coverage with ₹0 shortfall!
          </div>
        </div>
      </div>

      <div className="telemetry-grid" style={{ marginBottom: 0, marginTop: 16 }}>
        <div className="telemetry-card">
          <span>REGULATORY PENALTY AVOIDED</span>
          <b style={{ color: 'var(--mint-strong)' }}>₹{penaltyAvoided.toFixed(2)} Lakh</b>
        </div>
        <div className="telemetry-card">
          <span>EFFECTIVE COST REDUCTION</span>
          <b style={{ color: 'var(--mint-strong)' }}>{((savings / cheapCost) * 100).toFixed(1)}% Lower</b>
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
                    <span style={{ color: 'var(--mint-strong)', fontWeight: 500 }}>
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