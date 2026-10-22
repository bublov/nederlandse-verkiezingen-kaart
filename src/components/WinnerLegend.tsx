import { Paper, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useMemo, useState } from "react";
import type { Station } from "../data/stations";
import { useTranslation } from "../i18n/useTranslation";

type WinnerLegendProps = {
  stations: Station[];
  onStationsSelect: (stations: Station[]) => void;
  onStationSelect: (station: Station) => void;
};

function WinnerLegend({
  stations,
  onStationsSelect,
  onStationSelect,
}: WinnerLegendProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const winners = new Map<
      string,
      { name: string; color: string; count: number }
    >();
    stations.forEach((station) => {
      const winner = winners.get(station.winnerPartyId);
      if (winner) {
        winner.count += 1;
      } else {
        winners.set(station.winnerPartyId, {
          name: station.winnerDisplayName,
          color: station.winnerColor,
          count: 1,
        });
      }
    });
    return [...winners.entries()].sort(
      (left, right) => right[1].count - left[1].count,
    );
  }, [stations]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const municipalities = useMemo(() => {
    const grouped = new Map<string, Station[]>();
    stations.forEach((station) => {
      const municipalityStations = grouped.get(station.municipality) ?? [];
      municipalityStations.push(station);
      grouped.set(station.municipality, municipalityStations);
    });
    return [...grouped.entries()]
      .filter(([municipality]) =>
        municipality.toLocaleLowerCase().includes(normalizedQuery),
      )
      .sort(([left], [right]) => left.localeCompare(right));
  }, [normalizedQuery, stations]);
  const matchingStations = useMemo(
    () =>
      stations.filter((station) =>
        [
          station.name,
          station.address,
          station.postcode,
          station.municipality,
        ].some((value) =>
          value.toLocaleLowerCase().includes(normalizedQuery),
        ),
      ),
    [normalizedQuery, stations],
  );

  return (
    <Paper
      shadow="md"
      withBorder
      p="sm"
      style={{
        position: "absolute",
        top: "5rem",
        right: "1rem",
        zIndex: 1100,
        width: "min(24rem, calc(100vw - 2rem))",
        maxHeight: "calc(100vh - 6rem)",
        overflowY: "auto",
      }}
    >
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          {t("winnerByPollingStation")}
        </Text>
        <TextInput
          placeholder={t("search")}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {normalizedQuery ? (
          <>
            {municipalities.map(([municipality, municipalityStations]) => (
              <UnstyledButton
                key={municipality}
                onClick={() => onStationsSelect(municipalityStations)}
                style={{ textAlign: "left", padding: "0.25rem" }}
              >
                <Text size="sm">{municipality}</Text>
                <Text size="xs" c="dimmed">
                  {municipalityStations.length} {t("pollingStations")}
                </Text>
              </UnstyledButton>
            ))}
            {matchingStations.map((station) => (
              <UnstyledButton
                key={`${station.municipality}-${station.code}`}
                onClick={() => onStationSelect(station)}
                style={{ textAlign: "left", padding: "0.25rem" }}
              >
                <Text size="sm">{station.name}</Text>
                <Text size="xs" c="dimmed">
                  {[station.municipality, station.address, station.postcode]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </UnstyledButton>
            ))}
          </>
        ) : rows.map(([partyId, winner]) => (
          <div
            key={partyId}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "0.45rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                aria-hidden="true"
                style={{
                  width: "0.9rem",
                  height: "0.9rem",
                  flex: "0 0 auto",
                  borderRadius: "50%",
                  backgroundColor: winner.color,
                }}
              />
              <Text size="sm" style={{ flex: 1 }}>
                {winner.name}
              </Text>
              <Text size="sm" c="dimmed">
                {winner.count.toLocaleString()}
              </Text>
            </div>
          </div>
        ))}
      </Stack>
    </Paper>
  );
}

export default WinnerLegend;
