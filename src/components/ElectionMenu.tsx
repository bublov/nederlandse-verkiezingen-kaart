import { Button, Group, Paper, Stack } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "../i18n/useTranslation";

type ElectionMenuProps = {
  onLevelChange?: (level: "pollingStation") => void;
  onViewChange?: (view: "winner") => void;
};

function ElectionMenu({ onLevelChange, onViewChange }: ElectionMenuProps) {
  const { t } = useTranslation();
  const [selectedLevel, setSelectedLevel] = useState("pollingStation");
  const [selectedView, setSelectedView] = useState("winner");

  return (
    <Paper shadow="md" withBorder p="md">
      <Stack gap="xs">
        <div style={{ overflowX: "auto" }}>
          <Group gap="xs" wrap="nowrap">
            <Button
              size="sm"
              variant={selectedLevel === "national" ? "filled" : "light"}
              disabled
            >
              {t("national")}
            </Button>
            <Button size="sm" variant="light" disabled>
              {t("province")}
            </Button>
            <Button size="sm" variant="light" disabled>
              {t("municipality")}
            </Button>
            <Button
              size="sm"
              variant={
                selectedLevel === "pollingStation" ? "filled" : "light"
              }
              onClick={() => {
                setSelectedLevel("pollingStation");
                onLevelChange?.("pollingStation");
              }}
            >
              {t("pollingStation")}
            </Button>
          </Group>
        </div>
        <div style={{ overflowX: "auto" }}>
          <Group gap="xs" wrap="nowrap">
            <Button
              size="sm"
              variant={selectedView === "winner" ? "filled" : "light"}
              onClick={() => {
                setSelectedView("winner");
                onViewChange?.("winner");
              }}
            >
              {t("winner")}
            </Button>
            <Button size="sm" variant="light" disabled>
              {t("share")}
            </Button>
            <Button size="sm" variant="light" disabled>
              {t("change")}
            </Button>
          </Group>
        </div>
      </Stack>
    </Paper>
  );
}

export default ElectionMenu;
