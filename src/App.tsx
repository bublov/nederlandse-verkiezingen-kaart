import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import MapView from "./components/MapView";
import ElectionSelector from "./components/ElectionSelector";
import ElectionMenu from "./components/ElectionMenu";
import LanguagePicker from "./components/LanguagePicker";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { useState } from "react";
import type { Election } from "./data/elections";
import type { Station } from "./data/stations";
import WinnerLegend from "./components/WinnerLegend";
import StationDetails from "./components/StationDetails";

function App() {
  const [selectedElection, setSelectedElection] = useState<Election>();
  const [selectedLevel, setSelectedLevel] = useState<"pollingStation">(
    "pollingStation",
  );
  const [selectedView, setSelectedView] = useState<"winner">("winner");
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station>();

  return (
    <MantineProvider>
      <LanguageProvider>
        <div style={{ position: "relative", height: "100vh" }}>
          <MapView
            election={selectedElection}
            level={selectedLevel}
            view={selectedView}
            onStationsLoaded={setStations}
            onStationClick={setSelectedStation}
          />
          <div
            style={{
              position: "absolute",
              top: "1rem",
              left: "1rem",
              zIndex: 1100,
              width: "min(32rem, calc(100vw - 2rem))",
            }}
          >
            <ElectionSelector onElectionChange={setSelectedElection} />
            <ElectionMenu
              onLevelChange={setSelectedLevel}
              onViewChange={setSelectedView}
            />
          </div>
          <LanguagePicker />
          {selectedStation ? (
            <StationDetails
              station={selectedStation}
              onClose={() => setSelectedStation(undefined)}
            />
          ) : (
            <WinnerLegend stations={stations} />
          )}
        </div>
      </LanguageProvider>
    </MantineProvider>
  );
}

export default App;