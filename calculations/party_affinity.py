import argparse
import csv
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path


DEFAULT_POLL_WEIGHT = 1.0
DEFAULT_SHRINK = 0.5
DEFAULT_MIN_OBS = 20
DEFAULT_MIN_STATIONS = 20
PAD = 0.5


def read_csv(path, delimiter=","):
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file, delimiter=delimiter))


def read_parties(path):
    parties = {}
    for row in read_csv(path):
        parties.setdefault(row["id"], row)
    return parties


def read_matrix(path):
    rows = read_csv(path)
    columns = [column for column in rows[0] if column != "partner"]
    matrix = {}
    for row in rows:
        matrix[row["partner"]] = {column: None if row[column] == "x" else float(row[column]) / 100
                                  for column in columns}
    return columns, matrix


def read_station_shares(path):
    station_votes = defaultdict(lambda: defaultdict(int))
    for row in read_csv(path, delimiter=";"):
        station_votes[row["GemeenteNaam"] + "|" + row["StembureauCode"]][row["PartijNaam"]] += int(row["AantalStemmen"])
    totals = {station: sum(votes.values()) for station, votes in station_votes.items()}
    station_ids = sorted(station for station in station_votes if totals[station] > 0)
    return station_ids, station_votes, totals


def pearson(left, right):
    pairs = [(a, b) for a, b in zip(left, right) if a is not None and b is not None]
    if len(pairs) < 2:
        return None
    left_mean = sum(a for a, _ in pairs) / len(pairs)
    right_mean = sum(b for _, b in pairs) / len(pairs)
    numerator = sum((a - left_mean) * (b - right_mean) for a, b in pairs)
    left_variance = sum((a - left_mean) ** 2 for a, _ in pairs)
    right_variance = sum((b - right_mean) ** 2 for _, b in pairs)
    denominator = math.sqrt(left_variance * right_variance)
    return numerator / denominator if denominator > 1e-12 else None      # None = no variance -> no information


def geographic_affinity(party_ids, station_ids, station_votes, min_stations=DEFAULT_MIN_STATIONS):
    """Positive part of the CLR correlation between parties. Parties in < min_stations stations get 0."""
    kept = [p for p in party_ids if sum(1 for s in station_ids if station_votes[s].get(p, 0) > 0) >= min_stations]
    vectors = {p: [] for p in kept}
    for station in station_ids:
        logs = [math.log(station_votes[station].get(p, 0) + PAD) for p in kept]
        log_total = math.log(sum(station_votes[station].get(p, 0) + PAD for p in kept))
        logs = [value - log_total for value in logs]                      # log of share among kept parties
        mean = sum(logs) / len(logs)
        for p, value in zip(kept, logs):
            vectors[p].append(value - mean)                               # centred log-ratio
    result = {o: {d: 0.0 for d in party_ids} for o in party_ids}
    for origin in kept:
        for destination in kept:
            correlation = pearson(vectors[origin], vectors[destination])
            result[origin][destination] = max(0.0, correlation) if correlation is not None else 0.0
    return result


def read_poll_changes(path, party_ids):
    rows = read_csv(path)
    by_pollster = defaultdict(list)
    for row in rows:
        values = {}
        for party_id in party_ids:
            value = row.get(party_id, "").strip()
            values[party_id] = (float(value) / (150 if row["seats_or_percentages"] == "seats" else 100)) if value else None
        by_pollster[row["pollster"]].append((datetime.strptime(row["date"], "%Y-%m-%d").date(), values))
    changes = {party_id: [] for party_id in party_ids}
    for polls in by_pollster.values():
        polls.sort(key=lambda poll: poll[0])
        for previous, current in zip(polls, polls[1:]):
            for party_id in party_ids:
                before, after = previous[1][party_id], current[1][party_id]
                changes[party_id].append(None if before is None or after is None else after - before)
    return changes


def poll_correlation(changes, party_ids, min_obs):
    kept = [p for p in party_ids if sum(value is not None for value in changes[p]) >= min_obs]
    return {o: {d: pearson(changes[o], changes[d]) for d in kept} for o in kept}


def calculate(avoidance_path, preferences_path, polls_path, results_path, parties_path,
              poll_weight=DEFAULT_POLL_WEIGHT, shrink=DEFAULT_SHRINK, min_obs=DEFAULT_MIN_OBS,
              min_stations=DEFAULT_MIN_STATIONS, survey_rows="partner"):
    parties = read_parties(parties_path)
    columns, preferences = read_matrix(preferences_path)
    _, avoidance = read_matrix(avoidance_path)
    station_ids, station_votes, _ = read_station_shares(results_path)
    party_ids = sorted(set(columns) | set(parties) | set(c for row in read_csv(polls_path) for c in row if c.isdigit()), key=int)

    affinity = geographic_affinity(party_ids, station_ids, station_votes, min_stations)
    for row_id in preferences:
        for column_id, preferred in preferences[row_id].items():
            avoided = avoidance.get(row_id, {}).get(column_id)
            if row_id == column_id or preferred is None or avoided is None:
                continue
            origin, destination = (column_id, row_id) if survey_rows == "partner" else (row_id, column_id)
            if origin in affinity and destination in affinity[origin]:
                affinity[origin][destination] = max(0.0, preferred - avoided)

    changes = read_poll_changes(polls_path, party_ids)
    correlations = poll_correlation(changes, party_ids, min_obs)
    if poll_weight:
        for origin in correlations:
            for destination, correlation in correlations[origin].items():
                if origin != destination and correlation is not None:
                    affinity[origin][destination] *= math.exp(-poll_weight * shrink * correlation)
    for party_id in party_ids:
        affinity[party_id][party_id] = 1.0
    return party_ids, affinity


def write_affinity(path, party_ids, affinity):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as file:
        output = csv.writer(file, lineterminator="\n")
        output.writerow(["id", *party_ids])
        for origin in party_ids:
            output.writerow([origin, *(f"{affinity[origin][d]:.12g}" for d in party_ids)])


def main():
    root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser()
    parser.add_argument("--avoidance", default=root / "public/parties/avoidance.csv", type=Path)
    parser.add_argument("--preferences", default=root / "public/parties/preferences.csv", type=Path)
    parser.add_argument("--polls", default=root / "public/polls/polls.csv", type=Path)
    parser.add_argument("--results", default=root / "public/results/tk/2025/stemmen_per_lijst_per_stembureau.csv", type=Path)
    parser.add_argument("--parties", default=root / "public/parties/parties.csv", type=Path)
    parser.add_argument("--poll-weight", type=float, default=DEFAULT_POLL_WEIGHT)
    parser.add_argument("--shrink", type=float, default=DEFAULT_SHRINK)
    parser.add_argument("--min-obs", type=int, default=DEFAULT_MIN_OBS)
    parser.add_argument("--min-stations", type=int, default=DEFAULT_MIN_STATIONS)
    parser.add_argument("--survey-rows", choices=["partner", "voter"], default="partner",
                        help="what the ROWS of preferences/avoidance are: the partner (original survey table) or the voter's party")
    parser.add_argument("--output", default=root / "public/parties/affinity.csv", type=Path)
    args = parser.parse_args()
    party_ids, affinity = calculate(args.avoidance, args.preferences, args.polls, args.results, args.parties,
                                    args.poll_weight, args.shrink, args.min_obs, args.min_stations, args.survey_rows)
    write_affinity(args.output, party_ids, affinity)


if __name__ == "__main__":
    main()