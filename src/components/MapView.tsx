import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function MapView() {
  return (
    <div style={{ position: "relative", height: "100vh" }}>
      <MapContainer
        center={[52.100917, 5.646265]}
        zoom={7.7}
        zoomSnap={0.1}
        style={{ height: "100%" }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
      </MapContainer>
    </div>
  );
}

export default MapView;