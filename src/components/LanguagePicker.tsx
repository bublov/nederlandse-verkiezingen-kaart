import { Paper, Select } from "@mantine/core";
import { useTranslation } from "../i18n/useTranslation";

function LanguagePicker() {
  const { language, setLanguage, t } = useTranslation();

  return (
    <Paper
      className="app-language"
      shadow="md"
      withBorder
      p="xs"
      style={{
        position: "absolute",
        top: "1rem",
        right: "1rem",
        zIndex: 1100,
        width: "min(10rem, calc(100vw - 2rem))",
      }}
    >
      <Select
        aria-label={t("language")}
        data={[
          { value: "nl", label: "Nederlands" },
          { value: "en", label: "English" },
        ]}
        value={language}
        allowDeselect={false}
        comboboxProps={{ zIndex: 1200 }}
        onChange={(value) => {
          if (value === "nl" || value === "en") {
            setLanguage(value);
          }
        }}
      />
    </Paper>
  );
}

export default LanguagePicker;
