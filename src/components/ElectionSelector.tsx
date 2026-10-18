import { Alert, Loader, Paper, Select, Stack, Text } from "@mantine/core";
import { useEffect, useState } from "react";
import { loadElections, type Election } from "../data/elections";
import { useTranslation } from "../i18n/useTranslation";

type ElectionSelectorProps = {
  onElectionChange?: (election: Election) => void;
};

function ElectionSelector({ onElectionChange }: ElectionSelectorProps) {
  const { t } = useTranslation();
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedType, setSelectedType] = useState("general");
  const [selectedElectionId, setSelectedElectionId] = useState("1");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;

    loadElections()
      .then((loadedElections) => {
        if (!active) {
          return;
        }

        const firstElection = loadedElections[0]!;
        setElections(loadedElections);
        setSelectedType(firstElection.type);
        setSelectedElectionId(firstElection.id);
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const typeOptions = [...new Set(elections.map((election) => election.type))]
    .sort()
    .map((type) => ({
      value: type,
      label: type === "general" ? t("general") : type,
    }));
  const electionOptions = elections
    .filter((election) => election.type === selectedType)
    .map((election) => ({
      value: election.id,
      label: election.label,
    }));
  const selectedElection = elections.find(
    (election) => election.id === selectedElectionId,
  );

  useEffect(() => {
    if (selectedElection) {
      onElectionChange?.(selectedElection);
    }
  }, [onElectionChange, selectedElection]);

  return (
    <Paper
      shadow="md"
      withBorder
      p="md"
      style={{
        width: "100%",
      }}
    >
      <Stack gap="sm">
        <Text size="sm" fw={600}>
          {t("election")}
        </Text>
        {error ? (
          <Alert color="red">{t("loadElectionsError")}</Alert>
        ) : elections.length === 0 ? (
          <>
            <Text size="sm">{t("loadingElections")}</Text>
            <Loader size="sm" />
          </>
        ) : (
          <>
            <Select
              label={t("electionType")}
              data={typeOptions}
              value={selectedType}
              allowDeselect={false}
              comboboxProps={{ zIndex: 1200 }}
              onChange={(value) => {
                const type = value ?? "general";
                setSelectedType(type);
                const firstElection = elections.find(
                  (election) => election.type === type,
                )!;
                setSelectedElectionId(firstElection.id);
              }}
            />
            <Select
              label={t("electionSelection")}
              data={electionOptions}
              value={selectedElectionId}
              allowDeselect={false}
              comboboxProps={{ zIndex: 1200 }}
              onChange={(value) => {
                setSelectedElectionId(value ?? "1");
              }}
            />
          </>
        )}
      </Stack>
    </Paper>
  );
}

export default ElectionSelector;
