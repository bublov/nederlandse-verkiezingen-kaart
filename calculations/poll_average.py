import argparse
import csv
from collections import defaultdict
from datetime import datetime
from pathlib import Path


TOTAL_SEATS = 150
META_COLUMNS = {"pollster", "date", "seats_or_percentages"}
HALF_SEAT = 0.5                       # in seats


def parse_date(value):
    return datetime.strptime(value, "%Y-%m-%d").date()


def read_parties(path):
    parties = {}
    with path.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            party_id = row["id"]
            if party_id not in parties:
                parties[party_id] = row
    return parties


def read_polls(path, parties):
    with path.open(encoding="utf-8-sig", newline="") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError("poll file contains no polls")
    party_ids = [column for column in rows[0] if column not in META_COLUMNS]
    missing = [party_id for party_id in party_ids if party_id not in parties]
    if missing:
        raise ValueError(f"poll columns are missing from parties.csv: {', '.join(missing)}")
    polls = []
    for row in rows:
        values = {}
        for party_id in party_ids:
            value = row[party_id].strip()
            values[party_id] = None if value == "" else float(value)
        polls.append({"pollster": row["pollster"], "date": parse_date(row["date"]),
                      "metric": row["seats_or_percentages"], "values": values})
    return polls, party_ids


def read_national_shares(path, parties):
    votes_by_id = defaultdict(int)
    with path.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file, delimiter=";"):
            votes_by_id[row["PartijNaam"]] += int(row["AantalStemmen"])
    total_votes = sum(votes_by_id.values())
    if total_votes == 0:
        raise ValueError("2025 results contain no votes")
    return {party["id"]: votes_by_id[party["id"]] / total_votes
            for party in parties.values() if party["id"] in votes_by_id}


def read_historical_pool(path, from_year):
    with path.open(encoding="utf-8-sig", newline="") as file:
        rows = [row for row in csv.DictReader(file) if int(row["year"]) >= from_year]
    if not rows:
        raise ValueError(f"no historical pool rows from {from_year}")
    return sum(float(row["seatless_share"]) for row in rows) / len(rows), [int(row["year"]) for row in rows]


def poll_shares(poll, party_ids, parties):
    """Share of the polled block per party; None = party did not exist yet at the poll date."""
    if poll["metric"] not in ("seats", "percentages"):
        raise ValueError(f"unknown poll metric: {poll['metric']}")
    half = HALF_SEAT if poll["metric"] == "seats" else 100.0 * HALF_SEAT / TOTAL_SEATS
    shares = {}
    for party_id in party_ids:
        value = poll["values"][party_id]
        exists = value is not None or poll["date"] >= parse_date(parties[party_id]["start_date"])
        if not exists:
            shares[party_id] = None
        else:
            shares[party_id] = half if value is None or value == 0 else value
    total = sum(v for v in shares.values() if v is not None)
    return {k: (v / total if v is not None else None) for k, v in shares.items()}


def decayed_average(polls, party_ids, anchor, half_life, weights, parties):
    selected = [poll for poll in polls if poll["date"] <= anchor]
    if not selected:
        raise ValueError("no polls on or before the anchor date")
    by_pollster = defaultdict(list)
    for poll in selected:
        poll["weight"] = 0.5 ** ((anchor - poll["date"]).days / half_life)
        poll["shares"] = poll_shares(poll, party_ids, parties)
        by_pollster[poll["pollster"]].append(poll)

    averages, freshness = {}, {}
    for pollster, pollster_polls in by_pollster.items():
        freshness[pollster] = weights.get(pollster, 1.0) * min(1.0, sum(p["weight"] for p in pollster_polls))
        averages[pollster] = {}
        for party_id in party_ids:
            total = denominator = 0.0
            for poll in pollster_polls:
                value = poll["shares"][party_id]
                if value is None:
                    continue
                total += value * poll["weight"]
                denominator += poll["weight"]
            averages[pollster][party_id] = total / denominator if denominator else None

    combined = {}
    for party_id in party_ids:
        weighted_total = weight_total = 0.0
        for pollster, values in averages.items():
            if values[party_id] is not None:
                weighted_total += values[party_id] * freshness[pollster]
                weight_total += freshness[pollster]
        combined[party_id] = weighted_total / weight_total if weight_total else 0.0
    total = sum(combined.values())
    if total <= 0:
        raise ValueError("poll averages contain no positive party shares")
    return {k: v / total for k, v in combined.items()}, selected, freshness


def calculate(polls_path, parties_path, results_path, historical_pool_path, asof=None, half_life=28.0,
              pool_share=None, pool_from_year=2010, min_share=1 / TOTAL_SEATS, weights=None):
    if half_life <= 0:
        raise ValueError("half-life must be positive")
    parties = read_parties(Path(parties_path))
    polls, party_ids = read_polls(Path(polls_path), parties)
    national_shares = read_national_shares(Path(results_path), parties)
    anchor = parse_date(asof) if asof else max(poll["date"] for poll in polls)
    averages, selected, freshness = decayed_average(polls, party_ids, anchor, half_life, weights or {}, parties)

    pool_years = None
    if pool_share is None:
        historical_pool = Path(historical_pool_path)
        if historical_pool.exists():
            pool_share, pool_years = read_historical_pool(historical_pool, pool_from_year)
        else:
            polled_ids = set(party_ids)
            pool_share = sum(
                share for party_id, share in national_shares.items()
                if party_id not in polled_ids
            )
            pool_years = [int(max(poll["date"].year for poll in polls))]

    statuses = {p: ("target" if averages[p] >= min_share or p not in national_shares else "pool") for p in party_ids}
    target_ids = [p for p in party_ids if statuses[p] == "target"]
    seat_like = [p for p in target_ids if averages[p] >= min_share]       # polls at least one seat
    if not seat_like:
        raise ValueError("no party polls at least one seat")
    factor = (1 - pool_share) / sum(averages[p] for p in seat_like)
    result = []
    for party_id in party_ids:
        target_share = averages[party_id] * factor if statuses[party_id] == "target" else 0.0
        result.append({"id": party_id, "status": statuses[party_id], "target_share": target_share})
    result.sort(key=lambda row: row["target_share"], reverse=True)
    carved = sum(row["target_share"] for row in result if row["id"] not in seat_like)
    info = {"pool_share": pool_share, "pool_years": pool_years, "carved_out_by_new_parties": carved,
            "pool_left_for_old_minors": 1 - sum(row["target_share"] for row in result), "freshness": freshness}
    return result, anchor, len(selected), info


def write_targets(path, result):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as file:
        output = csv.DictWriter(file, fieldnames=["id", "status", "target_share"])
        output.writeheader()
        output.writerows({"id": r["id"], "status": r["status"], "target_share": f"{r['target_share']:.12g}"} for r in result)


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--polls", default=root / "public/polls/polls.csv", type=Path)
    parser.add_argument("--parties", default=root / "public/parties/parties.csv", type=Path)
    parser.add_argument("--results", default=root / "public/results/tk/2025/stemmen_per_lijst_per_stembureau.csv", type=Path)
    parser.add_argument("--historical-pool", default=root / "public/elections/historical_pool.csv", type=Path)
    parser.add_argument("--asof")
    parser.add_argument("--half-life", type=float, default=28.0)
    parser.add_argument("--pool-share", type=float, help="override the historical mean")
    parser.add_argument("--pool-from-year", type=int, default=2010)
    parser.add_argument("--min-share", type=float, default=1 / TOTAL_SEATS)
    parser.add_argument("--weights", default="")
    parser.add_argument("--output", default=root / "public/polls/targets.csv", type=Path)
    args = parser.parse_args()
    weights = {key: float(value) for key, value in (item.split("=", 1) for item in args.weights.split(",") if item)}
    result, anchor, n_polls, info = calculate(args.polls, args.parties, args.results, args.historical_pool, args.asof,
                                              args.half_life, args.pool_share, args.pool_from_year, args.min_share, weights)
    write_targets(args.output, result)
    print(f"anchor {anchor} | polls {n_polls} | fixed pool {info['pool_share']:.4%} (years {info['pool_years']}) | "
          f"carved out by new parties {info['carved_out_by_new_parties']:.4%} | pool left for 2025 minors {info['pool_left_for_old_minors']:.4%}")


if __name__ == "__main__":
    main()