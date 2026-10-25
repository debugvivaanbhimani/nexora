import json, statistics as st, copy, time, sys
from opt import *
EMERG = 0.09  # emergency funding rate on shortfall (per year)
def eff(r): return r["cost_lakh"] + r["total_short"] * EMERG * 100
out = {}

# E0 reference scenario, all strategies
A, O = reference()
rows = {}
for name, fn in [("greedy_inventory", greedy_inventory), ("greedy_cheapest", greedy_cheapest), ("greedy_scarcity", greedy_scarcity)]:
    r = fn(A, O); rows[name] = dict(cost=round(r["cost_lakh"],1), short=round(r["total_short"],2), eff=round(eff(r),1), util=round(r["util"],1))
for name, kw in [("lp", {}), ("milp", {"integer": True})]:
    r = lp_alloc(A, O, **kw); rows[name] = dict(cost=round(r["cost_lakh"],1), short=round(r["total_short"],2), eff=round(eff(r),1), util=round(r["util"],1), lines=r["lines"])
out["E0_reference"] = rows

# E1 benchmark of algorithms across tightness (100 seeds each)
E1 = {}
for tight in [0.6, 0.85, 1.0, 1.1]:
    agg = {k: dict(eff=[], short_cases=0, short=[]) for k in ["greedy_inventory", "greedy_cheapest", "greedy_scarcity", "lp"]}
    for seed in range(100):
        A, O = random_instance(60, 15, tight, seed)
        res = {"greedy_inventory": greedy_inventory(A, O), "greedy_cheapest": greedy_cheapest(A, O), "greedy_scarcity": greedy_scarcity(A, O), "lp": lp_alloc(A, O)}
        for k, r in res.items():
            agg[k]["eff"].append(eff(r)); agg[k]["short"].append(r["total_short"]); agg[k]["short_cases"] += r["total_short"] > 1e-6
    base = agg["lp"]["eff"]
    E1[tight] = {k: dict(eff_vs_lp_pct=round(st.mean([(e - b) / b * 100 for e, b in zip(v["eff"], base)]), 1),
                         short_cases=v["short_cases"], mean_short=round(st.mean(v["short"]), 1)) for k, v in agg.items()}
out["E1_algorithms"] = E1
json.dump(out, open("results.json","w"), indent=1, default=str); print("E1 done", file=sys.stderr)

# E2 LP vs MILP gap & times by size
E2 = []
for nA, nO in [(20, 5), (60, 15), (200, 40), (500, 80), (1000, 100), (3000, 200)]:
    A, O = random_instance(nA, nO, 0.85, 7)
    r1 = lp_alloc(A, O); r2 = lp_alloc(A, O, integer=True) if nA <= 1000 else None
    E2.append(dict(assets=nA, obligations=nO, vars=sum(1 for o in O for a in A if A[a]["cls"] in O[o]["eligible"]),
                   lp_s=round(r1["solve_s"], 3), milp_s=round(r2["solve_s"], 3) if r2 else None,
                   gap_pct=round((r2["cost_lakh"] - r1["cost_lakh"]) / r1["cost_lakh"] * 100, 2) if r2 else None,
                   lp_lines=r1["lines"], milp_status=r2["status"] if r2 else None))
out["E2_scaling"] = E2
json.dump(out, open("results.json","w"), indent=1, default=str); print("E2 done", file=sys.stderr)

# E3 constraint options on reference and on random tight instances
def ref_variant(**kw):
    A, O = reference(); r = lp_alloc(A, O, integer=True, **kw)
    return dict(cost=round(r["cost_lakh"], 1), short=round(r["total_short"], 2), lines=r["lines"], util=round(r["util"], 1))
E3 = {"baseline_milp": ref_variant()}
E3["cash_min_50pct"] = ref_variant(cash_min=0.5)
A, O = reference()
conc = {o: [(lambda a, d: d["cls"] == "EQUITY", 0.25), (lambda a, d: d["cls"].startswith("CORP"), 0.10)] for o in O}
E3["conc_equity25_corp10"] = ref_variant(conc=conc)
conc2 = {o: [(lambda a, d, aa=aa: a == aa, 0.40) for aa in A] for o in O}
E3["single_asset_max40pct"] = ref_variant(conc=conc2)
E3["mta_5cr"] = ref_variant(mta=5)
E3["ticket_cost_0p5L"] = ref_variant(ticket=0.005)
E3["ticket_cost_5L"] = ref_variant(ticket=0.05)
out["E3_constraints_reference"] = E3

agg = {}
for label, kw in [("base", {}), ("cash50", {"cash_min": 0.5}), ("mta3", {"mta": 3}), ("ticket", {"ticket": 0.02})]:
    vals = []
    for seed in range(12):
        A, O = random_instance(30, 8, 0.75, 100 + seed)
        r = lp_alloc(A, O, integer=True, **kw); vals.append((eff(r), r["lines"], r["total_short"], r["solve_s"]))
        print(label, seed, r["status"], round(r["solve_s"],2), file=sys.stderr)
    agg[label] = dict(eff=st.mean(v[0] for v in vals), lines=st.mean(v[1] for v in vals), short=st.mean(v[2] for v in vals), solve_s=st.mean(v[3] for v in vals))
b = agg["base"]
out["E3_constraints_random"] = {k: dict(eff_change_pct=round((v["eff"] - b["eff"]) / b["eff"] * 100, 1), avg_lines=round(v["lines"], 1),
                                        avg_short=round(v["short"], 2), solve_ms=round(v["solve_s"] * 1000)) for k, v in agg.items()}
json.dump(out, open("results.json","w"), indent=1, default=str); print("E3 done", file=sys.stderr)

# E4 re-optimisation after a price shock: full re-opt vs churn-penalised
E4 = []
for seed in range(15):
    A, O = random_instance(30, 8, 0.75, 200 + seed)
    r0 = lp_alloc(A, O, integer=True); prev = r0["alloc"]
    A2 = copy.deepcopy(A)
    for a in A2:
        if A2[a]["cls"] in ("EQUITY", "GOLD"): A2[a]["price"] *= 0.8
        if A2[a]["cls"] == "CORP_AA": A2[a]["price"] *= 0.95
    rf = lp_alloc(A2, O, integer=True)
    rc = lp_alloc(A2, O, integer=True, prev=prev, churn=0.02)
    moved = lambda r: sum(abs(r["alloc"].get(k, 0) - prev.get(k, 0)) for k in set(r["alloc"]) | set(prev))
    E4.append((eff(rf), eff(rc), moved(rf), moved(rc), rf["total_short"], rc["total_short"]))
out["E4_reopt"] = dict(full_eff=round(st.mean(e[0] for e in E4), 1), churn_eff=round(st.mean(e[1] for e in E4), 1),
                       full_moved=round(st.mean(e[2] for e in E4), 1), churn_moved=round(st.mean(e[3] for e in E4), 1),
                       full_short=round(st.mean(e[4] for e in E4), 2), churn_short=round(st.mean(e[5] for e in E4), 2))
json.dump(out, open("results.json","w"), indent=1, default=str); print("E4 done", file=sys.stderr)

# E5 priority-weighted shortfall when insufficient
A, O = reference(); O["O3"]["req"] = 70
flat = lp_alloc(A, O, integer=True)
pw = lp_alloc(A, O, integer=True, prio_weights={"O1": 3.0, "O2": 2.0, "O3": 1.0})
out["E5_priority"] = dict(flat={o: round(v, 2) for o, v in flat["short"].items()}, weighted={o: round(v, 2) for o, v in pw["short"].items()},
                          flat_total=round(flat["total_short"], 2), weighted_total=round(pw["total_short"], 2))

# E6 stress test: haircut multiplier -> shortfall curve on reference
A, O = reference(); base_alloc = lp_alloc(A, O, integer=True)["alloc"]
curve = []
for mult in [1.0, 1.25, 1.5, 2.0, 2.5, 3.0]:
    hc = {a: min(0.99, A[a]["h"] * mult) for a in A}
    s_fixed = summarise(A, O, base_alloc, hc)["total_short"]   # same allocation, stressed haircuts
    s_reopt = lp_alloc(A, O, integer=True, stress=mult)["total_short"]
    curve.append(dict(mult=mult, short_if_unchanged=round(s_fixed, 2), short_after_reopt=round(s_reopt, 2)))
out["E6_stress"] = curve

# E7 headroom metric: max uniform increase of all requirements before shortfall (bisection)
A, O = reference(); lo, hi = 1.0, 2.0
for _ in range(25):
    mid = (lo + hi) / 2; O2 = {o: dict(v, req=v["req"] * mid) for o, v in O.items()}
    if lp_alloc(A, O2)["total_short"] > 1e-6: hi = mid
    else: lo = mid
out["E7_headroom_pct"] = round((lo - 1) * 100, 2)

json.dump(out, open("results.json", "w"), indent=1, default=str)
print(json.dumps(out, indent=1, default=str))
