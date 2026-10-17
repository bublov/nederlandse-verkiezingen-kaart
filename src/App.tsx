import { MantineProvider } from "@mantine/core";
import "@mantine/core/styles.css";
import MapView from "./components/MapView";

function App() {
  return (
    <MantineProvider>
      <MapView />
    </MantineProvider>
  );
}

export default App;