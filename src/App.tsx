import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import MapView from "./components/MapView";
import ElectionSelector from "./components/ElectionSelector";
import ElectionMenu from "./components/ElectionMenu";
import LanguagePicker from "./components/LanguagePicker";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { useCallback, useState } from "react";
import type { Election } from "./data/elections";
import type { Station } from "./data/stations";
import WinnerLegend from "./components/WinnerLegend";
import StationDetails from "./components/StationDetails";
import "./responsive.css";

function App() {
  const [selectedElection, setSelectedElection] = useState<Election>();
  const [selectedLevel, setSelectedLevel] = useState<
    "national" | "pollingStation" | "municipality" | "province"
  >(
    "pollingStation",
  );
  const [selectedView, setSelectedView] = useState<"winner">("winner");
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station>();
  const [showWinnerLegend, setShowWinnerLegend] = useState(true);
  const [focusStations, setFocusStations] = useState<Station[]>();
  const [elections, setElections] = useState<Election[]>([]);
  const comparisonElection =
    selectedElection?.label === "forecastPollingAverage"
      ? elections.find((election) => election.id === "1")
      : undefined;
  const handleElectionChange = useCallback((election: Election) => {
    setSelectedElection(election);
    setFocusStations(undefined);
    setShowWinnerLegend(true);
  }, []);
  const winnerTitleKey =
    selectedLevel === "national"
      ? "winnerByNational"
      : selectedLevel === "municipality"
        ? "winnerByMunicipality"
        : selectedLevel === "province"
          ? "winnerByProvince"
          : "winnerByPollingStation";

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
            onMunicipalityClick={setSelectedStation}
            onProvinceClick={setSelectedStation}
            focusStations={focusStations}
            comparisonElection={comparisonElection}
          />
          <div
            className="app-controls"
            style={{
              position: "absolute",
              top: "1rem",
              left: "1rem",
              zIndex: 1100,
              width: "min(32rem, calc(100vw - 2rem))",
              maxHeight: "calc(100vh - 2rem)",
              overflowY: "auto",
            }}
          >
            <ElectionSelector
              onElectionChange={handleElectionChange}
              onElectionsLoaded={setElections}
            />
            <ElectionMenu
              onLevelChange={(level) => {
                setSelectedLevel(level);
                setSelectedStation(undefined);
                setFocusStations(undefined);
                setShowWinnerLegend(level !== "national");
              }}
              onViewChange={setSelectedView}
            />
          </div>
          <LanguagePicker />
          {selectedStation || selectedLevel === "national" ? (
            <StationDetails
              station={selectedStation ?? stations[0]!}
              onClose={() => setSelectedStation(undefined)}
              showClose={selectedLevel !== "national"}
            />
          ) : showWinnerLegend ? (
            <WinnerLegend
              stations={stations}
              titleKey={winnerTitleKey}
              level={selectedLevel}
              onStationsSelect={setFocusStations}
              onStationSelect={(station) => {
                setSelectedStation(station);
                setFocusStations([station]);
              }}
              onClose={() => setShowWinnerLegend(false)}
            />
          ) : (
            <button
              type="button"
              className="winner-legend-reopen"
              onClick={() => setShowWinnerLegend(true)}
            >
              {winnerTitleKey === "winnerByPollingStation"
                ? "Grootste partij"
                : winnerTitleKey === "winnerByProvince"
                  ? "Provincies"
                  : "Gemeenten"}
            </button>
          )}
        </div>
      </LanguageProvider>
    </MantineProvider>
  );
}

export default App;