import { parseCsvLine } from "./elections";
import type { Election } from "./elections";

export type Station = {
  name: string;
  municipality: string;
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
  }>;
};

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
    .filter(
      (station) =>
        Number.isFinite(station.latitude) && Number.isFinite(station.longitude),
    );
}
