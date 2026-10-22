import argparse
import csv
import math
import shutil
from collections import defaultdict
from pathlib import Path


POOL = "pool"
LOYALTY = 0.70
FLOOR = 0.05
K_STATION = 20.0
K_MUNI = 50.0
IPF_ITERS = 500
IPF_TOL = 1e-10


def read_csv(path, delimiter=","):
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file, delimiter=delimiter))


def read_parties(path):
    parties = {}
    for row in read_csv(path):
        parties.setdefault(row["id"], row)
    return parties


def read_targets(path):
    return {row["id"]: float(row["target_share"]) for row in read_csv(path) if row["status"] == "target"}


def read_affinity(path):
    rows = read_csv(path)
    ids = [column for column in rows[0] if column != "id"]
    return {row["id"]: {party_id: float(row[party_id]) for party_id in ids} for row in rows}


def read_baseline(stations_path, votes_path, parties, election_date):
    stations = read_csv(stations_path)
    votes = defaultdict(lambda: defaultdict(int))
    names_to_ids = {pid: pid for pid, party in parties.items() if party["start_date"] <= election_date}
    for row in read_csv(votes_path, delimiter=";"):
        party_id = names_to_ids.get(row["PartijNaam"])
        if party_id is not None:
            votes[row["GemeenteNaam"] + "|" + row["StembureauCode"]][party_id] += int(row["AantalStemmen"])
    return stations, votes


# ── small numeric helpers (lists of lists, no numpy) ─────────────────────────
def col_sums(rows, width):
    sums = [0.0] * width
    for row in rows:
        for j, value in enumerate(row):
            sums[j] += value
    return sums


def rake(rows, col_target, row_total, iters=IPF_ITERS, tol=1e-9):
    """Two-margin IPF in place: column totals -> col_target, row totals -> row_total."""
    width = len(col_target)
    scale = max(sum(row_total), 1.0)
    for _ in range(iters):
        cs = col_sums(rows, width)
        factor = [col_target[j] / cs[j] if cs[j] > 0 else 0.0 for j in range(width)]
        for row, total in zip(rows, row_total):
            s = 0.0
            for j in range(width):
                row[j] *= factor[j]
                s += row[j]
            r = total / max(s, 1e-300)
            for j in range(width):
                row[j] *= r
        cs = col_sums(rows, width)
        if max(abs(cs[j] - col_target[j]) for j in range(width)) / scale < tol:
            break
    return rows


def fit_flows(base, t, A, loyalty, iters=IPF_ITERS, tol=IPF_TOL):
    """IPF: rows -> base, columns -> t. Returns the transfer matrix T (rows sum to 1)."""
    nO, nD = len(A), len(A[0])
    M = []
    for i in range(nO):
        off = [A[i][j] * t[j] if j != i else 0.0 for j in range(nD)]
        rs = sum(off)
        off = [v / rs if rs > 0 else 0.0 for v in off]
        row = [(1 - loyalty[i]) * v for v in off]
        row[i] += loyalty[i]
        M.append([v + (1e-12 if t[j] > 0 else 0.0) for j, v in enumerate(row)])
    F = [[base[i] * v for v in M[i]] for i in range(nO)]
    for _ in range(iters):
        cs = col_sums(F, nD)
        for row in F:
            for j in range(nD):
                row[j] *= t[j] / cs[j] if cs[j] > 0 else 0.0
        for i in range(nO):
            rs = sum(F[i])
            f = base[i] / rs if rs > 0 else 0.0
            F[i] = [v * f for v in F[i]]
        cs = col_sums(F, nD)
        if max(abs(cs[j] - t[j]) for j in range(nD)) < tol:
            break
    return [[v / max(base[i], 1e-300) for v in F[i]] for i in range(nO)]


def similarity(O, minors, V, affinity, total_minor_votes):
    """Origin x origin similarity with the POOL as one block (affinity of the minors, weighted by 2025 votes)."""
    n = len(O)
    old = [p for p in O if p != POOL]
    S = [[0.0] * n for _ in range(n)]
    for i, o in enumerate(old):
        for j, d in enumerate(old):
            S[i][j] = affinity.get(o, {}).get(d, 0.0)
    for i in range(n):
        S[i][i] = 1.0
    if POOL in O and old:
        usable = [m for m in minors if m in affinity]
        weight = sum(total_minor_votes[m] for m in usable)
        if weight > 0:
            for j, d in enumerate(old):
                row = sum(total_minor_votes[m] / weight * affinity[m].get(d, 0.0) for m in usable)
                S[n - 1][j] = row
                S[j][n - 1] = row
    return S


def build_forecast(stations, baseline, targets, new_party_donors, parties, affinity, gone=()):
    party_ids = sorted(parties, key=int)
    keys, muni = [], {}
    for station in stations:
        key = station["GemeenteNaam"] + "|" + station["StembureauCode"]
        if key in baseline and sum(baseline[key].values()) > 0 and key not in muni:
            keys.append(key)
            muni[key] = station["GemeenteNaam"]
    N = [float(sum(baseline[k].values())) for k in keys]
    total = sum(N)
    party_total = {p: sum(baseline[k].get(p, 0) for k in keys) for p in party_ids}
    in_baseline = [p for p in party_ids if party_total[p] > 0]

    explicit = [p for p in targets if p in in_baseline]
    new = [p for p in targets if p not in in_baseline]
    for p in new:
        if not new_party_donors.get(p):
            raise ValueError(f"target for new party {p} has no donor weights")
    minors = [p for p in in_baseline if p not in explicit]
    pool_t = 1.0 - sum(targets.values())
    if pool_t < -1e-9:
        raise ValueError("targets sum to more than 1")
    pool_t = max(pool_t, 0.0)

    O = explicit + ([POOL] if minors else [])
    D = O + new
    nO, nD = len(O), len(D)
    S = []
    for k, n in zip(keys, N):
        row = [baseline[k].get(p, 0) / n for p in explicit]
        if minors:
            row.append(sum(baseline[k].get(m, 0) for m in minors) / n)
        S.append(row)
    base = [sum(S[s][i] * N[s] for s in range(len(keys))) / total for i in range(nO)]
    t = [targets[p] for p in explicit] + ([pool_t] if minors else []) + [targets[p] for p in new]
    loyalty = [LOYALTY] * nO

    # affinity matrix: origin x destination
    Sim = similarity(O, minors, None, affinity, party_total)
    A = [[0.0] * nD for _ in range(nO)]
    for i in range(nO):
        for j in range(nO):
            A[i][j] = FLOOR + Sim[i][j]
    for jn, name in enumerate(new):
        donors = new_party_donors[name]
        wsum = sum(donors.values())
        for i in range(nO):
            prof = 0.0
            for donor, w in donors.items():
                di = O.index(donor) if donor in O else (O.index(POOL) if POOL in O and donor in minors else None)
                if di is None:
                    raise ValueError(f"donor {donor} of {name} is unknown")
                prof += w / wsum * Sim[i][di]
            A[i][nO + jn] = FLOOR + prof
    for i in range(nO):                                   # row-normalise (diagonal excluded, then set to 1)
        others = [A[i][j] for j in range(nD) if j != i]
        mu = sum(others) / len(others)
        A[i] = [v / mu for v in A[i]]
        A[i][i] = 1.0

    T = fit_flows(base, t, A, loyalty)
    t_ref = base + [0.0] * len(new)
    T_ref = fit_flows(base, t_ref, A, loyalty)
    Tc = list(zip(*T))
    Rc = list(zip(*T_ref))
    E = []
    for s in range(len(keys)):
        row = S[s]
        num = [sum(a * b for a, b in zip(row, Tc[j])) for j in range(nD)]
        den = [sum(a * b for a, b in zip(row, Rc[j])) for j in range(nO)]
        out = list(num)
        for j in range(nO):                                # ratio mode
            ratio = num[j] / max(den[j], 1e-12) if den[j] > 1e-12 else 1.0
            out[j] = row[j] * ratio if row[j] > 0 else max(num[j] - den[j], 0.0)
        E.append([v * N[s] for v in out])
    R = rake(E, [v * total for v in t], N)

    # split the pool among the minor parties
    final = {k: {} for k in keys}
    for s, k in enumerate(keys):
        for j, p in enumerate(D):
            if p != POOL:
                final[k][p] = R[s][j]
    if minors:
        pool_votes = [R[s][O.index(POOL)] for s in range(len(keys))]
        Vm = [[float(baseline[k].get(m, 0)) for m in minors] for k in keys]
        nat = [sum(Vm[s][c] for s in range(len(keys))) for c in range(len(minors))]
        nat_sum = sum(nat)
        nat_c = [v / nat_sum for v in nat]
        by_muni = defaultdict(lambda: [0.0] * len(minors))
        for s, k in enumerate(keys):
            for c in range(len(minors)):
                by_muni[muni[k]][c] += Vm[s][c]
        c_st = []
        for s, k in enumerate(keys):
            g = by_muni[muni[k]]
            g_sum = sum(g)
            c_muni = [(g[c] + K_MUNI * nat_c[c]) / (g_sum + K_MUNI) for c in range(len(minors))]
            own = sum(Vm[s])
            c_st.append([(Vm[s][c] + K_STATION * c_muni[c]) / (own + K_STATION) for c in range(len(minors))])
        fixed = [0.0 if m in gone else None for m in minors]
        room = pool_t - sum(v for v in fixed if v is not None)
        tm = [nat[c] / total for c in range(len(minors))]
        free_sum = sum(tm[c] for c in range(len(minors)) if fixed[c] is None)
        tm_abs = [fixed[c] if fixed[c] is not None else (tm[c] / free_sum * max(room, 0.0) if free_sum > 0 else 0.0)
                  for c in range(len(minors))]
        tm_sum = max(sum(tm_abs), 1e-300)
        tmc = [v / tm_sum for v in tm_abs]
        Rm = [[pool_votes[s] * c_st[s][c] for c in range(len(minors))] for s in range(len(keys))]
        Rm = rake(Rm, [v * sum(pool_votes) for v in tmc], pool_votes)
        for s, k in enumerate(keys):
            for c, m in enumerate(minors):
                final[k][m] = Rm[s][c]

    nat_final = defaultdict(float)
    for k in keys:
        for p, v in final[k].items():
            nat_final[p] += v
    error = max(abs(nat_final[p] / total - targets[p]) for p in targets)
    station_error = max(abs(sum(final[k].values()) - n) for k, n in zip(keys, N))
    return {k: {p: final[k].get(p, 0.0) for p in party_ids} for k in keys}, keys, {"target_error": error, "station_total_error": station_error}


def integerise(forecast, station_totals):
    """Largest remainder per station; station totals preserved exactly."""
    result = {}
    for key, values in forecast.items():
        total = station_totals[key]
        floors = {p: int(math.floor(v)) for p, v in values.items()}
        remainder = max(total - sum(floors.values()), 0)
        ranked = sorted(values, key=lambda p: values[p] - floors[p], reverse=True)
        for p in ranked[:remainder]:
            floors[p] += 1
        result[key] = floors
    return result


def write_votes(path, stations, votes, parties):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as file:
        output = csv.writer(file, delimiter=";", lineterminator="\n")
        output.writerow(["GemeenteNaam", "StembureauCode", "PartijNaam", "AantalStemmen"])
        seen = set()
        for station in stations:
            key = station["GemeenteNaam"] + "|" + station["StembureauCode"]
            if key not in votes or key in seen:
                continue
            seen.add(key)
            for party_id in sorted(votes[key], key=int):
                output.writerow([station["GemeenteNaam"], station["StembureauCode"], party_id, votes[key][party_id]])


def run(root, output, new_party_donors, affinity_path, gone=()):
    elections = read_csv(root / "public/elections/elections.csv")
    baseline_elections = [
        election
        for election in elections
        if election["label"] != "forecastPollingAverage"
    ]
    if not baseline_elections:
        raise ValueError("no non-forecast election is available as a baseline")
    last_election = max(baseline_elections, key=lambda row: row["date"])
    parties = read_parties(root / "public/parties/parties.csv")
    targets = read_targets(root / "public/polls/targets.csv")
    affinity = read_affinity(affinity_path)
    stations, baseline = read_baseline(root / "public" / last_election["stembureaus_data"],
                                       root / "public" / last_election["stemmen_data"], parties, last_election["date"])
    forecast, keys, diagnostics = build_forecast(stations, baseline, targets, new_party_donors, parties, affinity, gone)
    station_totals = {k: sum(baseline[k].values()) for k in keys}
    votes = integerise(forecast, station_totals)
    output.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / "public" / last_election["stembureaus_data"], output / "stembureaus.csv")
    write_votes(output / "stemmen_per_lijst_per_stembureau.csv", stations, votes, parties)
    return diagnostics


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=root / "public/results/tk/forecast", type=Path)
    parser.add_argument("--affinity", default=root / "public/parties/affinity.csv", type=Path)
    parser.add_argument("--new-party-donors", default="28=1:0.6;15:0.2;3:0.1;11:0.1",
                        help="donors as PARTY_ID=DONOR_ID:WEIGHT;DONOR_ID:WEIGHT, repeat (comma-separated) for several new parties")
    parser.add_argument("--gone", default="", help="comma-separated ids of 2025 parties that will not run")
    args = parser.parse_args()
    new_party_donors = {}
    for specification in args.new_party_donors.split(","):
        if not specification:
            continue
        party_id, donor_specification = specification.split("=", 1)
        donors = {}
        for donor in donor_specification.split(";"):
            donor_id, weight = donor.split(":", 1)
            donors[donor_id] = float(weight)
        if not donors or abs(sum(donors.values()) - 1.0) > 1e-9:
            raise ValueError(f"donor weights for {party_id} must sum to 1")
        new_party_donors[party_id] = donors
    gone = [g for g in args.gone.split(",") if g]
    diagnostics = run(root, args.output, new_party_donors, args.affinity, gone)
    print(f"target error {diagnostics['target_error']:.2e} | station total error {diagnostics['station_total_error']:.2e}")


if __name__ == "__main__":
    main()