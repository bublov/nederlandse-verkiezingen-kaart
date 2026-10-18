import { parseCsvLine } from "./elections";
import type { Election } from "./elections";

export type Station = {
  name: string;
  municipality: string;
  code: string;
  latitude: number;
  longitude: number;
  winnerColor: string;
  winnerDisplayName: string;
  postcode: string;
  address: string;
  totalVotes: number;
  votes: Array<{
    displayName: string;
    color: string;
    votes: number;
  }>;
};

type Party = {
  name: string;
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

export async function loadStations(election: Election): Promise<Station[]> {
  const [stationsCsv, votesCsv, partiesCsv] = await Promise.all([
    loadCsv(election.stembureaus),
    loadCsv(election.stemmen),
    loadCsv("parties/parties.csv"),
  ]);

  const parties = parseRows(partiesCsv, ",").map<Party>((row) => ({
    name: row.name,
    displayName: row.display_name,
    color: row.color ? `#${row.color}` : defaultColor,
    startDate: row.start_date,
  }));
  const partiesByName = new Map<string, Party[]>();
  parties.forEach((party) => {
    for (const name of [party.name, party.displayName]) {
      const matches = partiesByName.get(name) ?? [];
      matches.push(party);
      partiesByName.set(name, matches);
    }
  });
  const votesByStation = new Map<string, Map<string, number>>();

  for (const row of parseRows(votesCsv, ";")) {
    const key = `${row.GemeenteNaam}|${row.StembureauCode}`;
    const votes = votesByStation.get(key) ?? new Map<string, number>();
    votes.set(row.PartijNaam, Number(row.AantalStemmen));
    votesByStation.set(key, votes);
  }

  return parseRows(stationsCsv, ",")
    .map((row) => {
      const key = `${row.GemeenteNaam}|${row.StembureauCode}`;
      const votes = votesByStation.get(key) ?? new Map<string, number>();
      const winner = [...votes.entries()].sort((left, right) => right[1] - left[1])[0];
      const party = winner
        ? partiesByName
            .get(winner[0])
            ?.filter((candidate) => candidate.startDate <= election.date)
            .sort((left, right) =>
              right.startDate.localeCompare(left.startDate),
            )[0]
        : undefined;
      const stationVotes = [...votes.entries()]
        .map(([partyName, count]) => {
          const matchingParty = partiesByName
            .get(partyName)
            ?.filter((candidate) => candidate.startDate <= election.date)
            .sort((left, right) =>
              right.startDate.localeCompare(left.startDate),
            )[0];

          return {
            displayName: matchingParty?.displayName ?? partyName,
            color: matchingParty?.color ?? defaultColor,
            votes: count,
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
        winnerDisplayName: party?.displayName ?? winner?.[0] ?? "Unknown",
        postcode: row.Postcode,
        address: [row.Straatnaam, row.Huisnummer, row.Huisletter]
          .filter(Boolean)
          .join(" "),
        totalVotes: stationVotes.reduce((sum, item) => sum + item.votes, 0),
        votes: stationVotes,
      };
    })
    .filter(
      (station) =>
        Number.isFinite(station.latitude) && Number.isFinite(station.longitude),
    );
}
