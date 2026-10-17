export type Election = {
  id: string;
  type: string;
  date: string;
  label: string;
  stembureaus: string;
  stemmen: string;
};

const electionsUrl = `${import.meta.env.BASE_URL}elections/elections.csv`;

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }

  values.push(value);
  return values;
}

function parseElections(csv: string): Election[] {
  const lines = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(lines[0] ?? "");

  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    );

    return {
      id: row.id,
      type: row.type,
      date: row.date,
      label: row.label,
      stembureaus: row.stembureaus_data,
      stemmen: row.stemmen_data,
    };
  });
}

export async function loadElections(): Promise<Election[]> {
  const response = await fetch(electionsUrl);

  if (!response.ok) {
    throw new Error(`Could not load elections (${response.status}).`);
  }

  return parseElections(await response.text());
}
