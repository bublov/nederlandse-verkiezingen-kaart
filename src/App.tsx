import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import MapView from "./components/MapView";
import ElectionSelector from "./components/ElectionSelector";
import LanguagePicker from "./components/LanguagePicker";
import { LanguageProvider } from "./i18n/LanguageProvider";

function App() {
  return (
    <MantineProvider>
      <LanguageProvider>
        <div style={{ position: "relative", height: "100vh" }}>
          <MapView />
          <ElectionSelector />
          <LanguagePicker />
        </div>
      </LanguageProvider>
    </MantineProvider>
  );
}

export default App;