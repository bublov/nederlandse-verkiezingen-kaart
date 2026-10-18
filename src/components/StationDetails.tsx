import { ActionIcon, Paper, Stack, Text } from "@mantine/core";
import type { Station } from "../data/stations";
import { useTranslation } from "../i18n/useTranslation";

type StationDetailsProps = {
  station: Station;
  onClose: () => void;
};

function StationDetails({ station, onClose }: StationDetailsProps) {
  const { t } = useTranslation();
  const topVotes = station.votes.slice(0, 9);
  const otherVotes = station.votes
    .slice(9)
    .reduce((sum, party) => sum + party.votes, 0);
  const rows = [
    ...topVotes,
    ...(otherVotes > 0
      ? [{ displayName: t("other"), color: "#b5b2ad", votes: otherVotes }]
      : []),
  ];
  const maximumPercentage = rows.reduce((maximum, party) => {
    const percentage =
      station.totalVotes === 0 ? 0 : (party.votes / station.totalVotes) * 100;
    return Math.max(maximum, percentage);
  }, 0);

  return (
    <Paper
      shadow="md"
      withBorder
      p="sm"
      style={{
        position: "absolute",
        top: "1rem",
        right: "1rem",
        zIndex: 1100,
        width: "min(26rem, calc(100vw - 2rem))",
        maxHeight: "calc(100vh - 2rem)",
        overflowY: "auto",
      }}
    >
      <Stack gap="xs">
        <div style={{ display: "flex", alignItems: "start" }}>
          <div style={{ flex: 1 }}>
            <Text fw={700}>{station.name}</Text>
            <Text size="sm" c="dimmed">
              {[station.municipality, station.address, station.postcode]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </div>
          <ActionIcon
            variant="subtle"
            aria-label={t("close")}
            onClick={onClose}
          >
            ×
          </ActionIcon>
        </div>
        <Text size="sm">
          {station.totalVotes.toLocaleString()} {t("votesCast")}
        </Text>
        {rows.map((party) => {
          const percentage =
            station.totalVotes === 0
              ? 0
              : (party.votes / station.totalVotes) * 100;
          return (
            <div
              key={party.displayName}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(7rem, 1fr) 1.5fr 4rem",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Text size="sm">{party.displayName}</Text>
              <div style={{ height: "1rem", background: "#eceae6" }}>
                <div
                  style={{
                    width: `${
                      maximumPercentage === 0
                        ? 0
                        : (percentage / maximumPercentage) * 100
                    }%`,
                    height: "100%",
                    background: party.color,
                  }}
                />
              </div>
              <Text size="sm" ta="right">
                {percentage.toFixed(1)}%
              </Text>
            </div>
          );
        })}
      </Stack>
    </Paper>
  );
}

export default StationDetails;
