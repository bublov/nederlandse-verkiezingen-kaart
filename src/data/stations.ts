import { parseCsvLine } from "./elections";
import type { Election } from "./elections";

export type Station = {
  name: string;
  municipality: string;
  municipalityCode: string;
  code: string;
  latitude: number;
  longitude: number;
  winnerColor: string;
  winnerPartyId: string;
  winnerDisplayName: string;
  postcode: string;
  address: string;
  totalVotes: number;
  previousTotalVotes?: number;
  votes: Array<{
    partyId: string;
    displayName: string;
    color: string;
    votes: number;
    previousVotes?: number;
    seats?: number;
  }>;
  isNational?: boolean;
  isAggregate?: boolean;
};

export type Municipality = Station;
export type Province = Station;

function allocateSeats(votes: Station["votes"][number][], seats = 150) {
  const allocated = new Map(votes.map((vote) => [vote.partyId, 0]));
  for (let seat = 0; seat < seats; seat += 1) {
    const winner = votes
      .map((vote) => ({
        partyId: vote.partyId,
        quotient: vote.votes / ((allocated.get(vote.partyId) ?? 0) + 1),
      }))
      .sort(
        (left, right) =>
          right.quotient - left.quotient ||
          Number(left.partyId) - Number(right.partyId),
      )[0];
    if (winner) {
      allocated.set(winner.partyId, (allocated.get(winner.partyId) ?? 0) + 1);
    }
  }
  return allocated;
}

export function aggregateNational(stations: Station[]): Station {
  const first = stations[0]!;
  const votesByParty = new Map<string, Station["votes"][number]>();
  let previousTotalVotes = 0;
  let hasPrevious = false;
  stations.forEach((station) => {
    previousTotalVotes += station.previousTotalVotes ?? 0;
    hasPrevious ||= station.previousTotalVotes !== undefined;
    station.votes.forEach((vote) => {
      const existing = votesByParty.get(vote.partyId);
      if (existing) {
        existing.votes += vote.votes;
        existing.previousVotes =
          existing.previousVotes === undefined &&
          vote.previousVotes === undefined
            ? undefined
            : (existing.previousVotes ?? 0) + (vote.previousVotes ?? 0);
      } else {
        votesByParty.set(vote.partyId, { ...vote });
      }
    });
  });
  const votes = [...votesByParty.values()].sort(
    (left, right) => right.votes - left.votes,
  );
  const winner = votes[0];
  const seats = allocateSeats(votes);
  votes.forEach((vote) => {
    vote.seats = seats.get(vote.partyId) ?? 0;
  });
  return {
    ...first,
    name: "Nederland",
    municipality: "Nederland",
    municipalityCode: "",
    code: "national",
    latitude: Number.NaN,
    longitude: Number.NaN,
    winnerColor: winner?.color ?? defaultColor,
    winnerPartyId: winner?.partyId ?? "",
    winnerDisplayName: winner?.displayName ?? "Unknown",
    totalVotes: votes.reduce((sum, vote) => sum + vote.votes, 0),
    previousTotalVotes: hasPrevious ? previousTotalVotes : undefined,
    votes,
    isNational: true,
    isAggregate: true,
  };
}

export function isMapVisibleStation(station: Station) {
  return (
    !station.municipalityCode.startsWith("GM9") &&
    Number.isFinite(station.latitude) &&
    Number.isFinite(station.longitude)
  );
}

type Party = {
  id: string;
  displayName: string;
  color: string;
  startDate: string;
};

const defaultColor = "#808080";

function parseRows(csv: string, separator: string) {
  const lines = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0] ?? "", separator).map((header) =>
    header.replace(/^\uFEFF/, "").trim(),
  );

  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseCsvLine(line, separator);
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );
  });
}

async function loadCsv(path: string) {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);

  if (!response.ok) {
    throw new Error(`Could not load election data (${response.status}).`);
  }

  return response.text();
}

function parseVotesByStation(csv: string) {
  const votes = new Map<string, Map<string, number>>();
  for (const row of parseRows(csv, ";")) {
    const key = `${row.GemeenteNaam}|${row.StembureauCode}`;
    const stationVotes = votes.get(key) ?? new Map<string, number>();
    stationVotes.set(row.PartijNaam, Number(row.AantalStemmen));
    votes.set(key, stationVotes);
  }
  return votes;
}

export async function loadStations(
  election: Election,
  comparisonElection?: Election,
): Promise<Station[]> {
  const [stationsCsv, votesCsv, partiesCsv, comparisonVotesCsv] =
    await Promise.all([
    loadCsv(election.stembureaus),
    loadCsv(election.stemmen),
    loadCsv("parties/parties.csv"),
    comparisonElection ? loadCsv(comparisonElection.stemmen) : Promise.resolve(""),
  ]);

  const parties = parseRows(partiesCsv, ",").map<Party>((row) => ({
    id: row.id,
    displayName: row.display_name,
    color: row.color ? `#${row.color}` : defaultColor,
    startDate: row.start_date,
  }));
  const partiesById = new Map<string, Party[]>();
  parties.forEach((party) => {
    const matches = partiesById.get(party.id) ?? [];
    matches.push(party);
    partiesById.set(party.id, matches);
  });
  const votesByStation = parseVotesByStation(votesCsv);
  const comparisonVotesByStation = comparisonElection
    ? parseVotesByStation(comparisonVotesCsv)
    : new Map<string, Map<string, number>>();

  return parseRows(stationsCsv, ",")
    .map((row) => {
      const key = `${row.GemeenteNaam}|${row.StembureauCode}`;
      const votes = votesByStation.get(key) ?? new Map<string, number>();
      const winner = [...votes.entries()].sort((left, right) => right[1] - left[1])[0];
      const party = winner
        ? partiesById
            .get(winner[0])
            ?.filter((candidate) => candidate.startDate <= election.date)
            .sort((left, right) =>
              right.startDate.localeCompare(left.startDate),
            )[0]
        : undefined;
      const stationVotes = [...votes.entries()]
        .map(([partyId, count]) => {
          const matchingParty = partiesById
            .get(partyId)
            ?.filter((candidate) => candidate.startDate <= election.date)
            .sort((left, right) =>
              right.startDate.localeCompare(left.startDate),
            )[0];

          return {
            partyId,
            displayName: matchingParty?.displayName ?? partyId,
            color: matchingParty?.color ?? defaultColor,
            votes: count,
            previousVotes: comparisonVotesByStation
              .get(key)
              ?.get(partyId),
          };
        })
        .sort((left, right) => right.votes - left.votes);

      return {
        name:
          row["Naam stembureau"]?.trim() ||
          row.StembureauNaam?.trim() ||
          row.StembureauCode?.trim() ||
          "Polling station",
        municipality: row.GemeenteNaam,
        municipalityCode: row["CBS gemeentecode"],
        code: row.StembureauCode,
        latitude: Number(row.Latitude),
        longitude: Number(row.Longitude),
        winnerColor: party?.color ?? defaultColor,
        winnerPartyId: winner?.[0] ?? "",
        winnerDisplayName: party?.displayName ?? winner?.[0] ?? "Unknown",
        postcode: row.Postcode,
        address: [row.Straatnaam, row.Huisnummer, row.Huisletter]
          .filter(Boolean)
          .join(" "),
        totalVotes: stationVotes.reduce((sum, item) => sum + item.votes, 0),
        previousTotalVotes: comparisonVotesByStation
          .get(key)
          ? [...comparisonVotesByStation.get(key)!.values()].reduce(
              (sum, value) => sum + value,
              0,
            )
          : undefined,
        votes: stationVotes,
      };
    })
}

export function aggregateMunicipalities(stations: Station[]): Municipality[] {
  const grouped = new Map<string, Station[]>();
  stations.forEach((station) => {
    const items = grouped.get(station.municipalityCode) ?? [];
    items.push(station);
    grouped.set(station.municipalityCode, items);
  });

  return [...grouped.values()].map((items) => {
    const first = items[0]!;
    const votesByParty = new Map<string, Station["votes"][number]>();
    let previousTotalVotes = 0;
    let hasPrevious = false;
    items.forEach((station) => {
      previousTotalVotes += station.previousTotalVotes ?? 0;
      hasPrevious ||= station.previousTotalVotes !== undefined;
      station.votes.forEach((vote) => {
        const existing = votesByParty.get(vote.partyId);
        if (existing) {
          existing.votes += vote.votes;
          existing.previousVotes =
            existing.previousVotes === undefined &&
            vote.previousVotes === undefined
              ? undefined
              : (existing.previousVotes ?? 0) + (vote.previousVotes ?? 0);
        } else {
          votesByParty.set(vote.partyId, { ...vote });
        }

      });
    });
    const votes = [...votesByParty.values()].sort(
      (left, right) => right.votes - left.votes,
    );
    const winner = votes[0];
    return {
      ...first,
      name: first.municipality,
      code: first.municipalityCode,
      latitude:
        items.reduce((sum, station) => sum + station.latitude, 0) / items.length,
      longitude:
        items.reduce((sum, station) => sum + station.longitude, 0) /
        items.length,
      winnerColor: winner?.color ?? defaultColor,
      winnerPartyId: winner?.partyId ?? "",
      winnerDisplayName: winner?.displayName ?? "Unknown",
      totalVotes: votes.reduce((sum, vote) => sum + vote.votes, 0),
      previousTotalVotes: hasPrevious ? previousTotalVotes : undefined,
      votes,
      isAggregate: true,
    };
  });
}

export function aggregateProvinces(
  stations: Station[],
  municipalityToProvince: Map<string, string>,
): Province[] {
  const grouped = new Map<string, Station[]>();
  stations.forEach((station) => {
    const province = municipalityToProvince.get(station.municipalityCode);
    if (!province) return;
    const items = grouped.get(province) ?? [];
    items.push(station);
    grouped.set(province, items);
  });

  return [...grouped.entries()].map(([province, items]) => {
    const first = items[0]!;
    const votesByParty = new Map<string, Station["votes"][number]>();
    let previousTotalVotes = 0;
    let hasPrevious = false;
    items.forEach((station) => {
      previousTotalVotes += station.previousTotalVotes ?? 0;
      hasPrevious ||= station.previousTotalVotes !== undefined;
      station.votes.forEach((vote) => {
        const existing = votesByParty.get(vote.partyId);
        if (existing) {
          existing.votes += vote.votes;
          existing.previousVotes =
            existing.previousVotes === undefined &&
            vote.previousVotes === undefined
              ? undefined
              : (existing.previousVotes ?? 0) + (vote.previousVotes ?? 0);
        } else {
          votesByParty.set(vote.partyId, { ...vote });
        }
      });
    });
    const votes = [...votesByParty.values()].sort(
      (left, right) => right.votes - left.votes,
    );
    const winner = votes[0];
    return {
      ...first,
      name: province,
      municipality: province,
      code: province,
      latitude:
        items.reduce((sum, station) => sum + station.latitude, 0) / items.length,
      longitude:
        items.reduce((sum, station) => sum + station.longitude, 0) /
        items.length,
      winnerColor: winner?.color ?? defaultColor,
      winnerPartyId: winner?.partyId ?? "",
      winnerDisplayName: winner?.displayName ?? "Unknown",
      totalVotes: votes.reduce((sum, vote) => sum + vote.votes, 0),
      previousTotalVotes: hasPrevious ? previousTotalVotes : undefined,
      votes,
      isAggregate: true,
    };
  });
}
