"""Reference collateral optimiser used for the option experiments.
Assets: dict id -> {cls, price, qty, h, cost, issuer, cashlike}
Obligations: dict id -> {req, eligible:set(cls), priority, ...}
"""
import pulp, time, random, math

def lp_alloc(A, O, integer=False, conc=None, cash_min=None, mta=None, ticket=None,
             prev=None, churn=None, prio_weights=None, pen=1000.0, stress=1.0, return_model=False):
    """Generic model.
    conc: dict obligation -> list of (asset-filter fn, max share of req)  (concentration)
    cash_min: share of each obligation that must be met by cashlike assets (e.g. 0.5)
    mta: minimum collateral value per allocation line (0 or >= mta)  -> needs binaries
    ticket: fixed cost (Rs cr/yr equiv) per allocation line used        -> needs binaries
    prev: previous allocation {(a,o): units}; churn: cost per unit moved
    stress: multiply haircuts by this factor (e.g. 1.5) and cap at 0.99
    """
    m = pulp.LpProblem("c", pulp.LpMinimize)
    cat = "Integer" if integer else "Continuous"
    x = {}
    for o, ob in O.items():
        for a, as_ in A.items():
            if as_["cls"] in ob["eligible"]:
                x[a, o] = pulp.LpVariable(f"x_{a}_{o}", 0, as_["qty"], cat=cat)
    s = {o: pulp.LpVariable(f"s_{o}", 0) for o in O}
    hc = {a: min(0.99, A[a]["h"] * stress) for a in A}
    val = lambda a: A[a]["price"] * (1 - hc[a])
    obj = pulp.lpSum(x[k] * A[k[0]]["price"] * A[k[0]]["cost"] for k in x)
    w = prio_weights or {o: 1.0 for o in O}
    obj += pulp.lpSum(pen * w[o] * s[o] for o in O)
    y = {}
    if mta or ticket:
        for k in x:
            y[k] = pulp.LpVariable(f"y_{k[0]}_{k[1]}", cat="Binary")
            m += x[k] <= A[k[0]]["qty"] * y[k]
            if mta:
                m += x[k] * val(k[0]) >= mta * y[k]
        if ticket:
            obj += pulp.lpSum(ticket * y[k] for k in y)
    d = {}
    if prev is not None and churn:
        for k in x:
            d[k] = pulp.LpVariable(f"d_{k[0]}_{k[1]}", 0)
            p = prev.get(k, 0)
            m += d[k] >= x[k] - p
            m += d[k] >= p - x[k]
        obj += pulp.lpSum(churn * d[k] for k in d)
    m += obj
    byO = {}
    for k in x: byO.setdefault(k[1], []).append(k[0])
    for o, ob in O.items():
        m += pulp.lpSum(x[a, o] * val(a) for a in byO.get(o, [])) + s[o] >= ob["req"], f"cov_{o}"
        if cash_min:
            m += pulp.lpSum(x[a, o] * val(a) for a in byO.get(o, []) if A[a].get("cashlike")) + s[o] >= cash_min * ob["req"]
        if conc and o in conc:
            for flt, share in conc[o]:
                m += pulp.lpSum(x[a, o] * val(a) for a in byO.get(o, []) if flt(a, A[a])) <= share * ob["req"]
    byA = {}
    for k in x: byA.setdefault(k[0], []).append(k)
    for a in A:
        if a in byA: m += pulp.lpSum(x[k] for k in byA[a]) <= A[a]["qty"], f"qty_{a}"
    t = time.time()
    m.solve(pulp.HiGHS(msg=False, timeLimit=10))
    dt = time.time() - t
    alloc = {k: v.value() for k, v in x.items() if v.value() and v.value() > 1e-6}
    res = summarise(A, O, alloc, hc)
    res["solve_s"] = dt
    res["status"] = pulp.LpStatus[m.status]
    res["lines"] = len(alloc)
    if return_model:
        res["model"] = m
    return res

def summarise(A, O, alloc, hc=None):
    hc = hc or {a: A[a]["h"] for a in A}
    cost = sum(u * A[a]["price"] * A[a]["cost"] for (a, o), u in alloc.items())
    cov = {o: sum(u * A[a]["price"] * (1 - hc[a]) for (a, oo), u in alloc.items() if oo == o) for o in O}
    short = {o: max(0.0, O[o]["req"] - cov[o]) for o in O}
    used = sum(alloc.values()); tot = sum(A[a]["qty"] for a in A)
    return dict(alloc=alloc, cost_lakh=cost * 100, cover=cov, short=short,
                total_short=sum(short.values()), util=used / tot * 100)

def greedy(A, O, asset_order, obl_order=None):
    rem = {a: A[a]["qty"] for a in A}; alloc = {}
    for o in (obl_order or list(O)):
        need = O[o]["req"]
        for a in asset_order(o):
            if need <= 1e-9: break
            if A[a]["cls"] not in O[o]["eligible"]: continue
            v = A[a]["price"] * (1 - A[a]["h"])
            take = min(rem[a] * v, need); u = take / v
            if u > 1e-9:
                alloc[(a, o)] = alloc.get((a, o), 0) + u; rem[a] -= u; need -= take
    return summarise(A, O, alloc)

def greedy_inventory(A, O): return greedy(A, O, lambda o: list(A))
def greedy_cheapest(A, O): return greedy(A, O, lambda o: sorted(A, key=lambda a: A[a]["cost"]))
def greedy_scarcity(A, O):
    """Smarter heuristic: serve obligations with the fewest eligible assets first;
    within an obligation, prefer assets that the fewest *other* obligations accept, then cheapest."""
    demand = {a: sum(1 for o in O if A[a]["cls"] in O[o]["eligible"]) for a in A}
    cap = {o: sum(A[a]["qty"] * A[a]["price"] * (1 - A[a]["h"]) for a in A if A[a]["cls"] in O[o]["eligible"]) for o in O}
    order = sorted(O, key=lambda o: cap[o] / max(O[o]["req"], 1e-9))
    return greedy(A, O, lambda o: sorted(A, key=lambda a: (demand[a], A[a]["cost"])), order)

CLASSES = [  # cls, haircut, cost, cashlike, issuer-group
    ("CASH", 0.0, 0.065, True, "CASH"), ("TBILL", 0.005, 0.012, True, "GOI"), ("GSEC_MID", 0.02, 0.009, True, "GOI"),
    ("GSEC_LONG", 0.04, 0.008, True, "GOI"), ("SDL", 0.03, 0.0085, False, "STATE"), ("CORP_AAA", 0.04, 0.005, False, "CORP"),
    ("CORP_AA", 0.08, 0.0045, False, "CORP"), ("EQUITY", 0.15, 0.0035, False, "EQ"), ("GOLD", 0.15, 0.004, False, "GOLD")]

def random_instance(nA, nO, tight, seed, p_elig=0.45):
    r = random.Random(seed); A = {}
    for i in range(nA):
        c = r.choice(CLASSES)
        A[f"A{i}"] = dict(cls=f"{c[0]}", price=1.0, qty=r.randint(5, 40), h=c[1], cost=round(c[2] * r.uniform(.8, 1.2), 5),
                          cashlike=c[3], issuer=f"{c[4]}_{r.randint(1,4)}")
    classes = [c[0] for c in CLASSES]
    O = {}
    cap_total = sum(a["qty"] * (1 - a["h"]) for a in A.values())
    ws = [r.random() + 0.2 for _ in range(nO)]
    for j in range(nO):
        el = {c for c in classes if r.random() < p_elig} or {"CASH"}
        O[f"O{j}"] = dict(req=cap_total * tight * ws[j] / sum(ws), eligible=el, priority=r.choice([1, 2, 3]))
    return A, O

def reference():
    A = {
     "CASH": dict(cls="CASH", price=1, qty=30, h=0.0, cost=0.065, cashlike=True, issuer="CASH"),
     "TBILL": dict(cls="TBILL", price=1, qty=20, h=0.005, cost=0.012, cashlike=True, issuer="GOI"),
     "GSEC_MID": dict(cls="GSEC_MID", price=1, qty=40, h=0.02, cost=0.009, cashlike=True, issuer="GOI"),
     "GSEC_LONG": dict(cls="GSEC_LONG", price=1, qty=30, h=0.04, cost=0.008, cashlike=True, issuer="GOI"),
     "CORP_AAA": dict(cls="CORP_AAA", price=1, qty=20, h=0.04, cost=0.005, cashlike=False, issuer="CORP_1"),
     "EQUITY_NIFTY": dict(cls="EQUITY", price=1, qty=25, h=0.15, cost=0.0035, cashlike=False, issuer="EQ"),
    }
    O = {
     "O1": dict(req=60, eligible={"CASH", "TBILL", "GSEC_MID", "GSEC_LONG"}, priority=1, name="CCP initial margin"),
     "O2": dict(req=45, eligible={"GSEC_MID", "GSEC_LONG", "CORP_AAA", "EQUITY"}, priority=2, name="Bilateral OTC margin"),
     "O3": dict(req=50, eligible={"TBILL", "GSEC_MID"}, priority=3, name="Bank repo"),
    }
    return A, O
