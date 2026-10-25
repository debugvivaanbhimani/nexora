import React, { useState, useEffect, useMemo } from "react";
import {
  Shield,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Zap,
  BarChart3,
  Lock,
  ArrowRight,
  TrendingDown,
  Coins,
  Cpu,
  Layers,
  FileText,
  Clock,
  Check,
  ChevronDown,
  Info,
  Sliders,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const API_BASE = "http://localhost:8000";

// Formatters
const formatLakh = (val) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);

const formatUnits = (val) =>
  new Intl.NumberFormat("en-IN").format(Math.round(val || 0));

export default function App() {
  // Global States
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("ref");
  const [scenarioData, setScenarioData] = useState(null);
  const [chainHealth, setChainHealth] = useState({ chain_connected: false });
  const [onChainState, setOnChainState] = useState([]);
  const [eventsList, setEventsList] = useState([]);

  // Active Plan & Benchmark States
  const [activePlan, setActivePlan] = useState(null);
  const [compareData, setCompareData] = useState(null);
  const [showCompare, setShowCompare] = useState(false);

  // Loading & Feedback States
  const [isResetting, setIsResetting] = useState(false);
  const [isOptimising, setIsOptimising] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [attackLoading, setAttackLoading] = useState(null);
  const [attackFeedback, setAttackFeedback] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);

  const showToast = (title, msg, type = "info") => {
    setToastMessage({ title, msg, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // 1. Fetch Health & Scenarios
  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const data = await res.json();
        setChainHealth(data);
      } else {
        setChainHealth({ chain_connected: false });
      }
    } catch {
      setChainHealth({ chain_connected: false });
    }
  };

  const fetchScenarios = async () => {
    try {
      const res = await fetch(`${API_BASE}/scenarios`);
      if (res.ok) {
        const data = await res.json();
        setScenarios(data);
      }
    } catch (err) {
      console.error("Failed to fetch scenarios", err);
    }
  };

  const fetchScenarioData = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/scenarios/${id}`);
      if (res.ok) {
        const data = await res.json();
        setScenarioData(data);
      }
    } catch (err) {
      console.error("Failed to load scenario details", err);
    }
  };

  const fetchState = async () => {
    try {
      const res = await fetch(`${API_BASE}/state`);
      if (res.ok) {
        const data = await res.json();
        setOnChainState(data);
      }
    } catch (err) {
      console.error("Failed to fetch state", err);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${API_BASE}/events`);
      if (res.ok) {
        const data = await res.json();
        setEventsList(data);
      }
    } catch (err) {
      console.error("Failed to fetch events", err);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchScenarios();
    fetchScenarioData(selectedScenarioId);
    fetchState();
    fetchEvents();

    const interval = setInterval(() => {
      fetchHealth();
      fetchState();
      fetchEvents();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedScenarioId) {
      fetchScenarioData(selectedScenarioId);
    }
  }, [selectedScenarioId]);

  // Actions
  const handleReset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch(`${API_BASE}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario_id: selectedScenarioId }),
      });
      const data = await res.json();
      if (res.ok) {
        setActivePlan(null);
        setCompareData(null);
        setShowCompare(false);
        setAttackFeedback(null);
        await fetchState();
        await fetchEvents();
        showToast("Chain Reset", `Ledger redeployed and seeded for scenario ${selectedScenarioId.toUpperCase()}`, "success");
      } else {
        showToast("Reset Failed", data.detail || "Error resetting ledger", "error");
      }
    } catch (err) {
      showToast("Connection Error", err.message, "error");
    } finally {
      setIsResetting(false);
    }
  };

  const handleOptimise = async () => {
    setIsOptimising(true);
    try {
      const res = await fetch(`${API_BASE}/optimise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario_id: selectedScenarioId,
          method: "optimiser",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActivePlan(data);
        showToast(
          "Optimal Plan Computed",
          `Solved in ${data.runtime_ms} ms. Funding Cost: ₹ ${formatLakh(data.totals.funding_cost_lakh)} L`,
          "success"
        );
      } else {
        showToast("Optimisation Error", data.detail || "Error running solver", "error");
      }
    } catch (err) {
      showToast("Error", err.message, "error");
    } finally {
      setIsOptimising(false);
    }
  };

  const handleCompare = async () => {
    setIsComparing(true);
    try {
      const res = await fetch(`${API_BASE}/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario_id: selectedScenarioId }),
      });
      const data = await res.json();
      if (res.ok) {
        setCompareData(data);
        setShowCompare(true);
        showToast("Benchmarking Ready", "Simulated all 4 allocation strategies", "info");
      } else {
        showToast("Comparison Error", data.detail || "Error running benchmarks", "error");
      }
    } catch (err) {
      showToast("Error", err.message, "error");
    } finally {
      setIsComparing(false);
    }
  };

  const handleCommit = async () => {
    if (!activePlan || !activePlan.plan_id) return;
    setIsCommitting(true);
    try {
      const res = await fetch(`${API_BASE}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: activePlan.plan_id }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        await fetchState();
        await fetchEvents();
        showToast("Committed to Blockchain", `Plan ${activePlan.plan_id} mined in Block #${data.block}!`, "success");
      } else {
        showToast("Commit Blocked", `Ledger rejected reservation: ${data.error}`, "error");
      }
    } catch (err) {
      showToast("Error", err.message, "error");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleAttack = async (type) => {
    setAttackLoading(type);
    try {
      const res = await fetch(`${API_BASE}/attack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      setAttackFeedback({
        type,
        error: data.error,
        args: data.args,
        timestamp: new Date().toLocaleTimeString(),
      });
      await fetchEvents();
      showToast(
        "Attack Deflected",
        `Smart contract successfully caught and reverted '${type}' with error '${data.error}'`,
        "error"
      );
    } catch (err) {
      showToast("Attack Simulation Error", err.message, "error");
    } finally {
      setAttackLoading(null);
    }
  };

  // State Lookup map
  const stateMap = useMemo(() => {
    const map = {};
    for (const item of onChainState) {
      map[item.asset_id] = item;
    }
    return map;
  }, [onChainState]);

  // Allocation Map for Grid
  const allocationLookup = useMemo(() => {
    const map = {};
    if (activePlan && activePlan.lines) {
      for (const line of activePlan.lines) {
        map[`${line.asset_id}_${line.obligation_id}`] = line;
      }
    }
    return map;
  }, [activePlan]);

  // Chart Data preparation
  const chartData = useMemo(() => {
    if (!compareData) return [];
    const methods = ["optimiser", "cheapest_first", "cash_first", "scarcity_aware"];
    const labels = {
      optimiser: "Optimiser (Nexora)",
      cheapest_first: "Cheapest First",
      cash_first: "Cash First",
      scarcity_aware: "Scarcity Aware",
    };
    return methods.map((m) => {
      const item = compareData[m];
      if (!item) return { name: labels[m] };
      return {
        name: labels[m],
        effectiveCost: Number(item.totals.effective_cost_lakh.toFixed(2)),
        shortfall: Number(item.totals.shortfall_lakh.toFixed(2)),
        fundingCost: Number(item.totals.funding_cost_lakh.toFixed(2)),
        utilisation: Number(item.totals.utilisation_pct.toFixed(1)),
      };
    });
  }, [compareData]);

  // Obligation Coverage stats
  const coveredCount = activePlan
    ? activePlan.coverage.filter((c) => c.covered).length
    : 0;
  const totalObligations = scenarioData?.obligations?.length || 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 flex items-start gap-3 bg-white border border-slate-200/90 shadow-xl rounded-xl p-4 max-w-md animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              toastMessage.type === "success"
                ? "bg-emerald-50 text-emerald-600"
                : toastMessage.type === "error"
                ? "bg-rose-50 text-rose-600"
                : "bg-brand-50 text-brand-600"
            }`}
          >
            {toastMessage.type === "success" ? (
              <Check className="w-5 h-5" />
            ) : toastMessage.type === "error" ? (
              <XCircle className="w-5 h-5" />
            ) : (
              <Info className="w-5 h-5" />
            )}
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-900">
              {toastMessage.title}
            </h4>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              {toastMessage.msg}
            </p>
          </div>
        </div>
      )}

      {/* 1. TOPBAR */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-brand-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-slate-900">
                  Nexora
                </span>
                <span className="text-[11px] font-semibold bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-200/60">
                  PledgeGuard
                </span>
                <span className="text-[10px] uppercase font-mono tracking-wider bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                  Innovise PS 1
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                Smart Collateral Allocation & Double-Pledge Prevention
              </p>
            </div>
          </div>

          {/* Action Controls & Health */}
          <div className="flex items-center gap-3">
            {/* Scenario Dropdown */}
            <div className="relative">
              <select
                id="scenario-select"
                value={selectedScenarioId}
                onChange={(e) => setSelectedScenarioId(e.target.value)}
                className="appearance-none bg-slate-100/90 hover:bg-slate-200/70 border border-slate-200 text-slate-800 text-xs font-medium rounded-lg pl-3 pr-8 py-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
              >
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id.toLowerCase()}>
                    {s.id}: {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Reset Button */}
            <button
              id="reset-btn"
              onClick={handleReset}
              disabled={isResetting}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 active:scale-98 transition-all disabled:opacity-50"
              title="Redeploy fresh CollateralLedger and seed scenario inventory"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-slate-500 ${
                  isResetting ? "animate-spin text-brand-600" : ""
                }`}
              />
              <span className="hidden sm:inline">Reset Chain</span>
            </button>

            {/* Optimise Button */}
            <button
              id="optimise-btn"
              onClick={handleOptimise}
              disabled={isOptimising}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-brand-700 bg-brand-50 hover:bg-brand-100/80 border border-brand-200 rounded-lg shadow-2xs active:scale-98 transition-all disabled:opacity-50"
            >
              <Zap
                className={`w-3.5 h-3.5 ${
                  isOptimising ? "animate-bounce" : "text-brand-600"
                }`}
              />
              <span>Optimise</span>
            </button>

            {/* Compare Button */}
            <button
              id="compare-btn"
              onClick={handleCompare}
              disabled={isComparing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-200 rounded-lg shadow-2xs active:scale-98 transition-all disabled:opacity-50"
            >
              <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Compare</span>
            </button>

            {/* Commit Button */}
            <button
              id="commit-btn"
              onClick={handleCommit}
              disabled={!activePlan || isCommitting}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg shadow-xs transition-all active:scale-98 ${
                activePlan && !isCommitting
                  ? "bg-brand-600 hover:bg-brand-700 text-white shadow-brand-500/20 cursor-pointer"
                  : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
              }`}
              title={
                !activePlan
                  ? "Compute an allocation plan first before committing"
                  : "Commit allocation atomically to CollateralLedger"
              }
            >
              {isCommitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>Commit to Chain</span>
            </button>

            {/* Chain Health Indicator */}
            <div
              className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200"
              title={
                chainHealth.chain_connected
                  ? `Hardhat Node Connected (Chain ID ${chainHealth.chain_id})`
                  : "Hardhat Node Disconnected"
              }
            >
              <span className="relative flex h-2.5 w-2.5">
                {chainHealth.chain_connected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    chainHealth.chain_connected ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                ></span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {chainHealth.chain_connected
                  ? `Chain #${chainHealth.chain_id}`
                  : "Offline"}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* SCENARIO HEADER SUMMARY */}
        {scenarioData && (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wide bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {scenarioData.id}
                </span>
                <h1 className="text-base sm:text-lg font-bold text-slate-900">
                  {scenarioData.name}
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">
                {scenarioData.description}
              </p>
            </div>
            <div className="flex items-center gap-3 self-start md:self-auto shrink-0 text-xs">
              <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg">
                <strong className="text-slate-900">
                  {scenarioData.assets?.length || 0}
                </strong>{" "}
                Assets
              </span>
              <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg">
                <strong className="text-slate-900">
                  {scenarioData.obligations?.length || 0}
                </strong>{" "}
                Obligations
              </span>
              <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-600 rounded-lg">
                <strong className="text-slate-900">
                  {scenarioData.rules?.length || 0}
                </strong>{" "}
                Rules
              </span>
            </div>
          </div>
        )}

        {/* 2. KPI CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* KPI 1: Funding Cost */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Funding Cost
              </span>
              <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                ₹ {activePlan ? formatLakh(activePlan.totals.funding_cost_lakh) : "0.00"} L
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <span>Annualized cost across all obligations</span>
              </p>
            </div>
          </div>

          {/* KPI 2: Shortfall */}
          <div
            className={`bg-white border rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow ${
              activePlan && activePlan.totals.shortfall_lakh > 0
                ? "border-rose-300 ring-2 ring-rose-500/10"
                : "border-slate-200/90"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Collateral Shortfall
              </span>
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  activePlan && activePlan.totals.shortfall_lakh > 0
                    ? "bg-rose-50 text-rose-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                {activePlan && activePlan.totals.shortfall_lakh > 0 ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
              </div>
            </div>
            <div className="mt-3">
              <div
                className={`text-2xl font-bold tracking-tight ${
                  activePlan && activePlan.totals.shortfall_lakh > 0
                    ? "text-rose-600"
                    : "text-slate-900"
                }`}
              >
                ₹ {activePlan ? formatLakh(activePlan.totals.shortfall_lakh) : "0.00"} L
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                {activePlan && activePlan.totals.shortfall_lakh > 0 ? (
                  <span className="font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                    Deficit Detected
                  </span>
                ) : (
                  <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                    100% Fully Satisfied
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* KPI 3: Utilisation */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Collateral Utilisation
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                {activePlan ? `${activePlan.totals.utilisation_pct.toFixed(1)}%` : "0.0%"}
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      activePlan?.totals.utilisation_pct || 0
                    )}%`,
                  }}
                ></div>
              </div>
            </div>
          </div>

          {/* KPI 4: Obligations Covered */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Obligations Covered
              </span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold tracking-tight text-slate-900">
                {activePlan ? `${coveredCount} / ${totalObligations}` : `- / ${totalObligations}`}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {activePlan && coveredCount === totalObligations
                  ? "All mandates satisfied"
                  : activePlan
                  ? `${totalObligations - coveredCount} obligation with shortfall`
                  : "Awaiting optimization"}
              </p>
            </div>
          </div>
        </div>

        {/* 3. TWO COLUMNS: INVENTORY TABLE & OBLIGATION COVERAGE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* COLUMN 1: LIVE INVENTORY TABLE (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Collateral Inventory & On-Chain State</span>
                  <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {scenarioData?.assets?.length || 0} Assets
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time synchronization with local Hardhat contract ledger
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                    <th className="px-4 py-3">Asset</th>
                    <th className="px-3 py-3">Class</th>
                    <th className="px-3 py-3 text-right">Total Qty</th>
                    <th className="px-3 py-3 text-right">Price</th>
                    <th className="px-3 py-3 text-right">Cost (bps)</th>
                    <th className="px-3 py-3 text-right">Reserved</th>
                    <th className="px-3 py-3 text-right font-bold text-slate-700">
                      Free Units
                    </th>
                    <th className="px-4 py-3 text-center">Ver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {scenarioData?.assets?.map((asset) => {
                    const chainAsset = stateMap[asset.id];
                    const reserved = chainAsset ? chainAsset.reserved : 0;
                    const free = chainAsset ? chainAsset.available : asset.quantity;
                    const version = chainAsset ? chainAsset.version : 1;

                    // Class badge coloring
                    const classPill = (cls) => {
                      if (cls === "CASH")
                        return "bg-emerald-50 text-emerald-700 border-emerald-200";
                      if (cls.includes("GSEC") || cls === "TBILL" || cls === "SDL")
                        return "bg-sky-50 text-sky-700 border-sky-200";
                      if (cls.includes("CORP"))
                        return "bg-violet-50 text-violet-700 border-violet-200";
                      return "bg-amber-50 text-amber-700 border-amber-200";
                    };

                    return (
                      <tr
                        key={asset.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">
                            {asset.id}
                          </div>
                          <div className="text-[11px] text-slate-400 font-normal truncate max-w-[140px]">
                            {asset.name}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${classPill(
                              asset.class
                            )}`}
                          >
                            {asset.class}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-700">
                          {formatUnits(asset.quantity)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                          {asset.price_bps === 10000
                            ? "Par"
                            : `${(asset.price_bps / 100).toFixed(1)}%`}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                          {asset.funding_cost_bps}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-500">
                          {formatUnits(reserved)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              free === 0
                                ? "bg-rose-50 text-rose-600"
                                : "text-slate-900"
                            }`}
                          >
                            {formatUnits(free)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            v{version}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* COLUMN 2: OBLIGATION COVERAGE (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Obligation Coverage & Mandates
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Required margin vs. haircut-adjusted usable collateral
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                Scale: 10⁸
              </span>
            </div>

            <div className="p-5 space-y-4 flex-1">
              {scenarioData?.obligations?.map((ob) => {
                const covItem = activePlan?.coverage?.find(
                  (c) => c.obligation_id === ob.id
                );
                const coveredLakh = covItem ? covItem.covered_lakh : 0;
                const requiredLakh = ob.required_lakh;
                const shortfallLakh = covItem ? covItem.shortfall_lakh : 0;
                const isCovered = covItem ? covItem.covered : false;
                const pct = Math.min(100, (coveredLakh / requiredLakh) * 100);

                const priorityBadge = (p) => {
                  if (p === 1)
                    return "bg-rose-50 text-rose-700 border-rose-200";
                  if (p === 2)
                    return "bg-amber-50 text-amber-700 border-amber-200";
                  return "bg-slate-100 text-slate-700 border-slate-200";
                };

                return (
                  <div
                    key={ob.id}
                    className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">
                            {ob.id}: {ob.name}
                          </span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${priorityBadge(
                              ob.priority
                            )}`}
                          >
                            P{ob.priority}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Counterparty: <strong>{ob.counterparty}</strong>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-slate-900">
                          ₹ {formatLakh(coveredLakh)} / {formatLakh(requiredLakh)} L
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {pct.toFixed(1)}% coverage
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200/80 rounded-full h-2 mt-3 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          isCovered
                            ? "bg-emerald-500"
                            : "bg-gradient-to-r from-amber-500 to-rose-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>

                    {/* Shortfall Alert if any */}
                    {!isCovered && activePlan && (
                      <div className="mt-2.5 flex items-center justify-between text-xs bg-rose-50/80 border border-rose-200/60 rounded-lg px-2.5 py-1 text-rose-700">
                        <span className="font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          Shortfall: ₹ {formatLakh(shortfallLakh)} L
                        </span>
                        {covItem?.reason && (
                          <span className="text-[10px] font-medium bg-rose-100/70 px-1.5 py-0.5 rounded text-rose-800">
                            {covItem.reason}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. ALLOCATION MATRIX */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Collateral Allocation Matrix</span>
                {activePlan && (
                  <span className="text-[10px] font-mono font-semibold bg-brand-50 text-brand-700 px-2 py-0.5 rounded border border-brand-200/50">
                    Plan ID: {activePlan.plan_id}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hover over an allocated cell to inspect usable value, annual cost, and solver rationale
              </p>
            </div>
            {activePlan && (
              <span className="text-xs font-mono text-slate-400">
                Plan Hash: {activePlan.plan_hash?.slice(0, 18)}...
              </span>
            )}
          </div>

          <div className="overflow-x-auto p-4">
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr>
                  <th className="p-3 text-left font-semibold text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200 w-48">
                    Asset \ Obligation
                  </th>
                  {scenarioData?.obligations?.map((ob) => (
                    <th
                      key={ob.id}
                      className="p-3 font-semibold text-slate-700 border-b border-slate-200 min-w-[130px]"
                    >
                      <div className="font-bold text-slate-900">{ob.id}</div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        Req: ₹ {formatLakh(ob.required_lakh)} L
                      </div>
                    </th>
                  ))}
                  <th className="p-3 font-bold text-slate-800 border-b border-slate-200 min-w-[120px] bg-slate-50/50">
                    Total Pledged
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {scenarioData?.assets?.map((asset) => {
                  let rowTotalUnits = 0;
                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/50">
                      <td className="p-3 text-left font-sans font-medium text-slate-800 border-r border-slate-100">
                        <div className="font-semibold text-slate-900 font-mono text-xs">
                          {asset.id}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {asset.class} · {asset.funding_cost_bps} bps
                        </div>
                      </td>

                      {scenarioData?.obligations?.map((ob) => {
                        const line = allocationLookup[`${asset.id}_${ob.id}`];
                        const units = line ? line.units : 0;
                        rowTotalUnits += units;

                        return (
                          <td
                            key={ob.id}
                            className="p-2.5 relative border-r border-slate-100"
                            onMouseEnter={() => line && setHoveredCell(line)}
                            onMouseLeave={() => setHoveredCell(null)}
                          >
                            {units > 0 ? (
                              <div className="inline-block bg-brand-50/90 hover:bg-brand-100 border border-brand-200/80 text-brand-900 px-3 py-1.5 rounded-lg font-bold text-xs shadow-2xs cursor-pointer transition-colors">
                                {formatUnits(units)}
                              </div>
                            ) : (
                              <span className="text-slate-300 select-none">-</span>
                            )}
                          </td>
                        );
                      })}

                      <td className="p-3 font-bold text-slate-900 bg-slate-50/50">
                        {rowTotalUnits > 0 ? (
                          <span className="text-slate-900 font-semibold">
                            {formatUnits(rowTotalUnits)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Cell Tooltip Popover / Detail View */}
          {hoveredCell && (
            <div className="mx-4 mb-4 p-3 bg-slate-900 text-white rounded-xl shadow-lg flex items-center justify-between text-xs animate-in fade-in duration-150">
              <div className="flex items-center gap-4">
                <span className="font-bold text-brand-300 font-mono">
                  {hoveredCell.asset_id} ➔ {hoveredCell.obligation_id}
                </span>
                <span>
                  Units: <strong>{formatUnits(hoveredCell.units)}</strong>
                </span>
                <span>
                  Usable Value: <strong>₹ {formatLakh(hoveredCell.usable_lakh)} L</strong>
                </span>
                <span>
                  Haircut: <strong>{(hoveredCell.haircut_bps / 100).toFixed(1)}%</strong>
                </span>
                <span>
                  Annual Cost: <strong>₹ {formatLakh(hoveredCell.annual_cost_lakh)} L</strong>
                </span>
              </div>
              <div className="text-slate-300 text-[11px] italic bg-slate-800 px-2 py-0.5 rounded">
                Reason: {hoveredCell.reason}
              </div>
            </div>
          )}
        </div>

        {/* 5. COMPARE PANEL (Conditional after Compare) */}
        {showCompare && compareData && (
          <div className="bg-white border border-indigo-200/90 rounded-2xl p-6 shadow-sm space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  <span>Strategy Benchmark Comparison (4 Methods)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Proposed two-stage LP optimization vs. standard industry baseline heuristics
                </p>
              </div>
              <button
                onClick={() => setShowCompare(false)}
                className="text-xs text-slate-400 hover:text-slate-600 font-medium"
              >
                Close
              </button>
            </div>

            {/* Recharts Grouped Bar Chart */}
            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#334155",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                  <Bar dataKey="effectiveCost" fill="#026ac8" name="Effective Cost (₹ L)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="shortfall" fill="#ef4444" name="Shortfall (₹ L)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="utilisation" fill="#10b981" name="Utilisation (%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Benchmark Details Table */}
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-500 uppercase text-[10px]">
                    <th className="p-3">Method</th>
                    <th className="p-3 text-right">Funding Cost (₹ L)</th>
                    <th className="p-3 text-right">Shortfall (₹ L)</th>
                    <th className="p-3 text-right font-bold text-slate-900">
                      Effective Cost (₹ L)
                    </th>
                    <th className="p-3 text-right">Utilisation (%)</th>
                    <th className="p-3 text-right">Runtime (ms)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium font-mono">
                  {Object.entries(compareData).map(([methodKey, res]) => {
                    const isBest = methodKey === "optimiser";
                    return (
                      <tr
                        key={methodKey}
                        className={isBest ? "bg-brand-50/40 font-bold" : "hover:bg-slate-50"}
                      >
                        <td className="p-3 font-sans capitalize text-slate-900 flex items-center gap-1.5">
                          {isBest && <Check className="w-3.5 h-3.5 text-brand-600" />}
                          {methodKey.replace("_", " ")}
                        </td>
                        <td className="p-3 text-right">
                          ₹ {formatLakh(res.totals.funding_cost_lakh)} L
                        </td>
                        <td
                          className={`p-3 text-right ${
                            res.totals.shortfall_lakh > 0 ? "text-rose-600 font-bold" : "text-slate-600"
                          }`}
                        >
                          ₹ {formatLakh(res.totals.shortfall_lakh)} L
                        </td>
                        <td className="p-3 text-right text-slate-900 font-bold">
                          ₹ {formatLakh(res.totals.effective_cost_lakh)} L
                        </td>
                        <td className="p-3 text-right">
                          {res.totals.utilisation_pct.toFixed(1)}%
                        </td>
                        <td className="p-3 text-right text-slate-500">
                          {res.runtime_ms} ms
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. BOTTOM ROW: AUDIT LOG (60%) & ATTACK PANEL (40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* AUDIT LOG (7 cols) */}
          <div className="lg:col-span-7 bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden flex flex-col h-[420px]">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span>On-Chain Encumbrance & Rejection Trail</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Immutable smart contract events merged with real-time deflection records
                </p>
              </div>
              <button
                onClick={fetchEvents}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Refresh logs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-slate-50">
              {eventsList.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                  <Clock className="w-8 h-8 text-slate-300 mb-2" />
                  No events recorded yet. Commit a plan or run an attack simulation.
                </div>
              ) : (
                eventsList.map((ev, idx) => {
                  const isRejected = ev.type === "Rejected";

                  return (
                    <div
                      key={idx}
                      className={`pt-2.5 text-xs flex items-start gap-3 ${
                        isRejected ? "bg-rose-50/40 p-2.5 rounded-xl border border-rose-100" : ""
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          isRejected
                            ? "bg-rose-100 text-rose-600"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {isRejected ? (
                          <XCircle className="w-3.5 h-3.5" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`font-semibold text-xs ${
                              isRejected ? "text-rose-700" : "text-slate-900"
                            }`}
                          >
                            {ev.type}
                            {isRejected && (
                              <span className="ml-1.5 text-[10px] font-mono bg-rose-200/70 text-rose-900 px-1.5 py-0.2 rounded">
                                {ev.reason}
                              </span>
                            )}
                          </span>

                          <span className="text-[10px] text-slate-400 font-mono">
                            {ev.time
                              ? new Date(ev.time * 1000).toLocaleTimeString()
                              : "-"}
                          </span>
                        </div>

                        {/* Event Details */}
                        <div className="text-[11px] text-slate-600 mt-1 font-mono break-all">
                          {isRejected ? (
                            <div>
                              <span>
                                Blocked: <strong>{ev.reason}</strong>
                              </span>
                              {ev.args && (
                                <span className="text-slate-500 block text-[10px] mt-0.5">
                                  Args: {JSON.stringify(ev.args)}
                                </span>
                              )}
                            </div>
                          ) : ev.type === "Reserved" ? (
                            <span>
                              Pledged {formatUnits(ev.args?.qty)} units of{" "}
                              <strong>{ev.args?.assetId}</strong> to{" "}
                              <strong>{ev.args?.obligationId}</strong> (Avail:{" "}
                              {formatUnits(ev.args?.availableAfter)})
                            </span>
                          ) : ev.type === "AllocationCommitted" ? (
                            <span>
                              Allocation{" "}
                              <strong>{String(ev.args?.allocationId)}</strong>{" "}
                              committed with {ev.args?.lineCount} lines by{" "}
                              <code className="text-slate-500">
                                {String(ev.args?.allocator).slice(0, 10)}...
                              </code>
                            </span>
                          ) : (
                            <span>
                              Registered <strong>{ev.args?.assetId}</strong> ({ev.args?.assetClass}) Total:{" "}
                              {formatUnits(ev.args?.total)}
                            </span>
                          )}
                        </div>

                        {ev.tx_hash && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Tx: {ev.tx_hash.slice(0, 16)}...
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ATTACK PANEL (5 cols) */}
          <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-rose-500" />
                  <span>Smart Contract Defense Console</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulate adversary Desk 2 attacks to verify on-chain revert enforcement
                </p>
              </div>
              <span className="text-[10px] font-mono bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-200">
                Desk #2
              </span>
            </div>

            <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
              <div className="space-y-2.5">
                {/* Attack 1 */}
                <button
                  id="attack-double-pledge"
                  onClick={() => handleAttack("double_pledge")}
                  disabled={attackLoading !== null}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-rose-50/70 border border-slate-200 hover:border-rose-300 rounded-xl text-left transition-all group"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-rose-700">
                      1. Double-Pledge Attack
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Reserve available + 1 units of least free asset
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-white text-rose-600 px-2 py-1 rounded border border-slate-200 shadow-2xs">
                    {attackLoading === "double_pledge" ? "Testing..." : "Trigger"}
                  </span>
                </button>

                {/* Attack 2 */}
                <button
                  id="attack-duplicate"
                  onClick={() => handleAttack("duplicate")}
                  disabled={attackLoading !== null}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-rose-50/70 border border-slate-200 hover:border-rose-300 rounded-xl text-left transition-all group"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-rose-700">
                      2. Duplicate Plan ID Attack
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Re-submit an existing committed allocation ID
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-white text-rose-600 px-2 py-1 rounded border border-slate-200 shadow-2xs">
                    {attackLoading === "duplicate" ? "Testing..." : "Trigger"}
                  </span>
                </button>

                {/* Attack 3 */}
                <button
                  id="attack-excessive"
                  onClick={() => handleAttack("excessive")}
                  disabled={attackLoading !== null}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-rose-50/70 border border-slate-200 hover:border-rose-300 rounded-xl text-left transition-all group"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-rose-700">
                      3. Excessive Quantity Attack
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Request total inventory + 1 units
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-white text-rose-600 px-2 py-1 rounded border border-slate-200 shadow-2xs">
                    {attackLoading === "excessive" ? "Testing..." : "Trigger"}
                  </span>
                </button>

                {/* Attack 4 */}
                <button
                  id="attack-ineligible"
                  onClick={() => handleAttack("ineligible")}
                  disabled={attackLoading !== null}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-rose-50/70 border border-slate-200 hover:border-rose-300 rounded-xl text-left transition-all group"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-rose-700">
                      4. Ineligible Collateral Attack
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Inject non-whitelisted asset class into obligation
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-white text-rose-600 px-2 py-1 rounded border border-slate-200 shadow-2xs">
                    {attackLoading === "ineligible" ? "Testing..." : "Trigger"}
                  </span>
                </button>

                {/* Attack 5 */}
                <button
                  id="attack-stale"
                  onClick={() => handleAttack("stale")}
                  disabled={attackLoading !== null}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 hover:bg-rose-50/70 border border-slate-200 hover:border-rose-300 rounded-xl text-left transition-all group"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-800 group-hover:text-rose-700">
                      5. Stale Concurrency Attack
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Submit with outdated expectedVersion counter
                    </div>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-white text-rose-600 px-2 py-1 rounded border border-slate-200 shadow-2xs">
                    {attackLoading === "stale" ? "Testing..." : "Trigger"}
                  </span>
                </button>
              </div>

              {/* Dynamic Attack Feedback Banner */}
              {attackFeedback && (
                <div className="mt-4 p-3 bg-slate-900 text-white rounded-xl shadow-xs text-xs animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-rose-400 font-bold flex items-center gap-1.5">
                      <XCircle className="w-3.5 h-3.5" />
                      Revert Enforced: {attackFeedback.error}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {attackFeedback.timestamp}
                    </span>
                  </div>
                  <div className="text-slate-300 text-[11px] font-mono mt-1 break-all">
                    Decoded Args: {JSON.stringify(attackFeedback.args)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        Nexora · Innovise Blockchain Hackathon (PS 1: Smart Collateral Allocation & Double-Pledge Prevention)
      </footer>
    </div>
  );
}
