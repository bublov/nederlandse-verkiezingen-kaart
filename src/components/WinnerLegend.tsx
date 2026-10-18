import { Paper, Stack, Text } from "@mantine/core";
import type { Station } from "../data/stations";
import { useTranslation } from "../i18n/useTranslation";

type WinnerLegendProps = {
  stations: Station[];
};

function WinnerLegend({ stations }: WinnerLegendProps) {
  const { t } = useTranslation();
  const winners = new Map<
    string,
    { color: string; count: number }
  >();

  stations.forEach((station) => {
    const winner = winners.get(station.winnerDisplayName);
    if (winner) {
      winner.count += 1;
    } else {
      winners.set(station.winnerDisplayName, {
        color: station.winnerColor,
        count: 1,
      });
    }
  });

  const rows = [...winners.entries()].sort(
    (left, right) => right[1].count - left[1].count,
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
        {rows.map(([name, winner]) => (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
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
              {name}
            </Text>
            <Text size="sm" c="dimmed">
              {winner.count.toLocaleString()}
            </Text>
          </div>
        ))}
      </Stack>
    </Paper>
  );
}

export default WinnerLegend;
