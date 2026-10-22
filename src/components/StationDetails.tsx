import { ActionIcon, Paper, Stack, Text } from "@mantine/core";
import type { Station } from "../data/stations";
import { useTranslation } from "../i18n/useTranslation";

type StationDetailsProps = {
  station: Station;
  onClose: () => void;
  showClose?: boolean;
};

function StationDetails({ station, onClose, showClose = true }: StationDetailsProps) {
  const { t } = useTranslation();
  const topVotes = station.isNational
    ? station.votes.filter((party) => (party.seats ?? 0) >= 1)
    : station.votes.slice(0, 9);
  const otherParties = station.isNational
    ? station.votes.filter((party) => (party.seats ?? 0) === 0)
    : station.votes.slice(9);
  const otherVotes = otherParties
    .reduce((sum, party) => sum + party.votes, 0);
  const otherPreviousVotes = otherParties
    .reduce((sum, party) => sum + (party.previousVotes ?? 0), 0);
  const hasOtherPreviousVotes = otherParties
    .some((party) => party.previousVotes !== undefined);
  const rows = [
    ...topVotes,
    ...(otherVotes > 0
      ? [
          {
            displayName: t("other"),
            color: "#b5b2ad",
            votes: otherVotes,
            previousVotes: hasOtherPreviousVotes
              ? otherPreviousVotes
              : undefined,
          },
        ]
      : []),
  ];
  const comparisonMaximum = rows.reduce((maximum, party) => {
    const percentage =
      station.totalVotes === 0 ? 0 : (party.votes / station.totalVotes) * 100;
    const previousPercentage =
      !station.previousTotalVotes || party.previousVotes === undefined
        ? 0
        : (party.previousVotes / station.previousTotalVotes) * 100;
    return Math.max(maximum, percentage, previousPercentage);
  }, 0) * 1.08;

  return (
    <Paper
      className="station-details"
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
            {!station.isAggregate && (
              <Text size="sm" c="dimmed">
                {[station.municipality, station.address, station.postcode]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
          </div>
          {showClose && (
            <ActionIcon
              variant="subtle"
              aria-label={t("close")}
              onClick={onClose}
            >
              ×
            </ActionIcon>
          )}
        </div>
        <Text size="sm">
          {station.totalVotes.toLocaleString()} {t("votesCast")}
        </Text>
        {station.isNational && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(6rem, 1fr) 1.5fr 3rem 4rem 4.5rem",
              gap: "0.5rem",
              color: "var(--mantine-color-dimmed)",
              fontSize: "var(--mantine-font-size-xs)",
            }}
          >
            <span />
            <span />
            <span>{t("seats")}</span>
            <span>{t("share")}</span>
            <span>{t("change")}</span>
          </div>
        )}
        {rows.map((party) => {
          const percentage =
            station.totalVotes === 0
              ? 0
              : (party.votes / station.totalVotes) * 100;
          const previousPercentage =
            !station.previousTotalVotes || party.previousVotes === undefined
              ? undefined
              : (party.previousVotes / station.previousTotalVotes) * 100;
          const change =
            previousPercentage === undefined
              ? undefined
              : percentage - previousPercentage;
          return (
            <div
              key={party.displayName}
              className={`station-result-row${
                station.isNational ? " national" : ""
              }`}
              style={{
                display: "grid",
                gridTemplateColumns: station.isNational
                  ? "minmax(6rem, 1fr) 1.5fr 3rem 4rem 4.5rem"
                  : "minmax(6rem, 1fr) 1.5fr 4rem 4.5rem",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Text size="sm">{party.displayName}</Text>
              <div
                style={{
                  position: "relative",
                  height: "1.1rem",
                  background: "#eceae6",
                  overflow: "hidden",
                }}
              >
                {previousPercentage !== undefined && (
                  <div
                    style={{
                      position: "absolute",
                      left: `${
                        comparisonMaximum === 0
                          ? 0
                          : (previousPercentage / comparisonMaximum) * 100
                      }%`,
                      top: 0,
                      width: "2px",
                      height: "100%",
                      background: "#171717",
                      transform: "translateX(-1px)",
                      zIndex: 2,
                    }}
                  />
                )}
                <div
                  style={{
                    position: "relative",
                    width: `${
                      comparisonMaximum === 0
                        ? 0
                        : (percentage / comparisonMaximum) * 100
                    }%`,
                    height: "100%",
                    background: party.color,
                    zIndex: 1,
                  }}
                />
              </div>
              {station.isNational && (
                <Text size="sm" ta="right">
                  {"seats" in party ? party.seats : undefined}
                </Text>
              )}
              <Text size="sm" ta="right">
                {percentage.toFixed(1)}%
              </Text>
              {change !== undefined ? (
                <Text
                  size="xs"
                  ta="right"
                  fw={600}
                  c={change >= 0 ? "teal" : "red"}
                >
                  {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)} pp
                </Text>
              ) : (
                <span />
              )}
            </div>
          );
        })}
      </Stack>
    </Paper>
  );
}

export default StationDetails;
