import {
  CircleMarker,
  GeoJSON,
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import type { Election } from "../data/elections";
import {
  aggregateMunicipalities,
  aggregateNational,
  aggregateProvinces,
  isMapVisibleStation,
  loadStations,
  type Station,
} from "../data/stations";
import "leaflet/dist/leaflet.css";

type MapViewProps = {
  election?: Election;
  level: "national" | "pollingStation" | "municipality" | "province";
  view: "winner";
  onStationsLoaded?: (stations: Station[]) => void;
  onStationClick?: (station: Station) => void;
  onMunicipalityClick?: (municipality: Station) => void;
  onProvinceClick?: (province: Station) => void;
  focusStations?: Station[];
  comparisonElection?: Election;
};

type StationMarkersProps = {
  stations: Awaited<ReturnType<typeof loadStations>>;
  view: "winner";
  onStationClick?: (station: Station) => void;
};

type MunicipalityFeature = {
  type: "Feature";
  properties: { gemeentecode: string; gemeentenaam: string };
  geometry: GeoJSON.Geometry;
};
type ProvinceFeature = {
  type: "Feature";
  properties: { provincienaam: string };
  geometry: GeoJSON.Geometry;
};

function MunicipalityMap({
  municipalities,
  features,
  onMunicipalityClick,
}: {
  municipalities: Station[];
  features: MunicipalityFeature[];
  onMunicipalityClick?: (municipality: Station) => void;
}) {
  const byCode = useMemo(
    () =>
      new Map(
        municipalities.map((municipality) => [municipality.code, municipality]),
      ),
    [municipalities],
  );
  return (
    <>
      {features.map((feature) => {
        const municipality = byCode.get(feature.properties.gemeentecode);
        return (
          <GeoJSON
            key={feature.properties.gemeentecode}
            data={feature}
            style={{
              color: "#ffffff",
              weight: 1,
              fillColor: municipality?.winnerColor ?? "#808080",
              fillOpacity: 0.58,
              opacity: 0.8,
            }}
            eventHandlers={{
              click: () => {
                if (municipality) onMunicipalityClick?.(municipality);
              },
            }}
          />
        );
      })}
    </>
  );
}

function ProvinceMap({
  provinces,
  features,
  onProvinceClick,
}: {
  provinces: Station[];
  features: ProvinceFeature[];
  onProvinceClick?: (province: Station) => void;
}) {
  const byName = useMemo(
    () => new Map(provinces.map((province) => [province.name, province])),
    [provinces],
  );
  return (
    <>
      {features.map((feature) => {
        const province = byName.get(feature.properties.provincienaam);
        return (
          <GeoJSON
            key={`${feature.properties.provincienaam}-${
              province?.winnerPartyId ?? "none"
            }-${province?.totalVotes ?? 0}`}
            data={feature}
            style={{
              color: "#ffffff",
              weight: 1,
              fillColor: province?.winnerColor ?? "#808080",
              fillOpacity: 0.58,
              opacity: 0.65,
            }}
            eventHandlers={{
              click: () => {
                if (province) onProvinceClick?.(province);
              },
            }}
          />
        );
      })}
    </>
  );
}

function MapFocus({ stations }: { stations?: Station[] }) {
  const map = useMap();

  useEffect(() => {
    if (!stations?.length) {
      return;
    }
    if (stations.length === 1) {
      map.setView([stations[0]!.latitude, stations[0]!.longitude], 15);
      return;
    }
    map.fitBounds(
      stations.map((station) => [station.latitude, station.longitude]),
      { padding: [72, 72], maxZoom: 11 },
    );
  }, [map, stations]);

  return null;
}

function StationMarkers({
  stations,
  view,
  onStationClick,
}: StationMarkersProps) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  const renderer = useMemo(() => L.canvas(), []);

  useMapEvents({
    zoomend: (event) => {
      setZoom(event.target.getZoom());
    },
  });

  const radius = Math.max(2, Math.min(18, 1.4 + (zoom - 6.5) * 0.95));
  const spacing = 2 * radius + 1.5;
  const groupingThresholdMeters = 5;
  const groups = useMemo(() => {
    const grouped: Array<{
      stations: Awaited<ReturnType<typeof loadStations>>;
      latitude: number;
      longitude: number;
    }> = [];
    const grid = new Map<string, number[]>();

    stations.forEach((station) => {
      const cellLatitude = Math.floor(
        (station.latitude * 111_320) / groupingThresholdMeters,
      );
      const cellLongitude = Math.floor(
        (station.longitude * 111_320) / groupingThresholdMeters,
      );
      let group: (typeof grouped)[number] | undefined;

      for (let latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset += 1) {
        for (
          let longitudeOffset = -1;
          longitudeOffset <= 1;
          longitudeOffset += 1
        ) {
          const candidateIndexes =
            grid.get(
              `${cellLatitude + latitudeOffset}|${
                cellLongitude + longitudeOffset
              }`,
            ) ?? [];
          for (const candidateIndex of candidateIndexes) {
            const candidate = grouped[candidateIndex]!;
            const latitudeDistance =
              (station.latitude - candidate.latitude) * 111_320;
            const longitudeDistance =
              (station.longitude - candidate.longitude) *
              111_320 *
              Math.cos((candidate.latitude * Math.PI) / 180);
            if (
              Math.hypot(latitudeDistance, longitudeDistance) <=
              groupingThresholdMeters
            ) {
              group = candidate;
              break;
            }

          }
          if (group) break;
        }
        if (group) break;
      }

      if (group) {
        group.stations.push(station);
      } else {
        const groupIndex = grouped.length;
        grouped.push({
          stations: [station],
          latitude: station.latitude,
          longitude: station.longitude,
        });
        const cellKey = `${cellLatitude}|${cellLongitude}`;
        const cellGroups = grid.get(cellKey) ?? [];
        cellGroups.push(groupIndex);
        grid.set(cellKey, cellGroups);
      }
    });
    return grouped;
  }, [stations]);

  const positionedStations = useMemo(() => groups.flatMap((group) => {
    const groupStations = group.stations;

    if (groupStations.length === 1) {
      const station = groupStations[0]!;
      return [
        {
          station,
          latitude: station.latitude,
          longitude: station.longitude,
        },
      ];
    }

    const center = map.project([group.latitude, group.longitude], zoom);

    return groupStations.map((station, index) => {
      let dx: number;
      let dy = 0;

      if (groupStations.length === 2) {
        dx = (index === 0 ? -0.5 : 0.5) * spacing;
      } else if (groupStations.length <= 7) {
        const ringRadius =
          spacing / (2 * Math.sin(Math.PI / groupStations.length));
        const angle =
          -Math.PI / 2 + (index * 2 * Math.PI) / groupStations.length;
        dx = ringRadius * Math.cos(angle);
        dy = ringRadius * Math.sin(angle);
      } else {
        const spiralRadius = spacing * 0.95 * Math.sqrt(index + 0.5);
        const angle = index * 2.39996;
        dx = spiralRadius * Math.cos(angle);
        dy = spiralRadius * Math.sin(angle);
      }

      const position = map.unproject(
        [center.x + dx, center.y + dy],
        zoom,
      );

      return {
        station,
        latitude: position.lat,
        longitude: position.lng,
      };
    });
  }), [groups, map, spacing, zoom]);

  return positionedStations.map(({ station, latitude, longitude }) => (
    <CircleMarker
      key={`${station.municipality}-${station.code}`}
      center={[latitude, longitude]}
      radius={radius}
      renderer={renderer}
      pathOptions={{
        color: "#fff",
        weight: 0.6,
        fillColor: view === "winner" ? station.winnerColor : "#808080",
        fillOpacity: 0.88,
        opacity: 1,
      }}
      eventHandlers={{ click: () => onStationClick?.(station) }}
    />
  ));
}

function MapView({
  election,
  level,
  view,
  onStationsLoaded,
  onStationClick,
  focusStations,
  onMunicipalityClick,
  onProvinceClick,
  comparisonElection,
}: MapViewProps) {
  const [stations, setStations] = useState<
    Awaited<ReturnType<typeof loadStations>>
  >([]);
  const [municipalityFeatures, setMunicipalityFeatures] = useState<
    MunicipalityFeature[]
  >([]);
  const [provinceFeatures, setProvinceFeatures] = useState<ProvinceFeature[]>(
    [],
  );
  const [municipalityToProvince, setMunicipalityToProvince] = useState(
    new Map<string, string>(),
  );

  useEffect(() => {
    if (!election) {
      return;
    }
    let active = true;
    loadStations(election, comparisonElection)
      .then((loadedStations) => {
        if (active) {
          setStations(loadedStations);
          const displayedStations =
            level === "national"
              ? [aggregateNational(loadedStations)]
              : level === "municipality"
              ? aggregateMunicipalities(loadedStations).filter(
                  isMapVisibleStation,
                )
              : level === "province"
                ? aggregateProvinces(
                    loadedStations,
                    municipalityToProvince,
                  ).filter(isMapVisibleStation)
                : loadedStations.filter(isMapVisibleStation);
          onStationsLoaded?.(displayedStations);
        }
      })
      .catch((error: unknown) => {
        console.error("Could not load polling station data.", error);
      });

    return () => {
      active = false;
    };
  }, [
    comparisonElection,
    election,
    level,
    municipalityToProvince,
    onStationsLoaded,
  ]);

  useEffect(() => {
    if (level !== "municipality" && level !== "province") return;
    const geometryPath =
      level === "province"
        ? "geography/provincies.geojson"
        : "geography/gemeenten.geojson";
    fetch(`${import.meta.env.BASE_URL}${geometryPath}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            `Could not load municipality map (${response.status}).`,
          );
        }
        return response.json() as Promise<{ features: MunicipalityFeature[] }>;
      })
      .then((data) => {
        if (level === "province") {
          setProvinceFeatures(data.features as unknown as ProvinceFeature[]);
        } else {
          setMunicipalityFeatures(data.features as MunicipalityFeature[]);
        }
      })
      .catch((error: unknown) =>
        console.error("Could not load municipality geography.", error),
      );
  }, [level]);

  const municipalities = useMemo(
    () => (level === "municipality" ? aggregateMunicipalities(stations) : []),
    [level, stations],
  );
  const provinces = useMemo(
    () =>
      level === "province"
        ? aggregateProvinces(stations, municipalityToProvince)
        : [],
    [level, municipalityToProvince, stations],
  );

  useEffect(() => {
    if (level !== "province") return;
    fetch(`${import.meta.env.BASE_URL}geography/gemeenten_to_provinces.csv`)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load province mapping (${response.status}).`);
        return response.text();
      })
      .then((csv) => {
        const lines = csv.trim().split(/\r?\n/).slice(1);
        const mapping = new Map<string, string>();
        lines.forEach((line) => {
          const [municipalityCode, province] = line.split(",").map((value) =>
            value?.trim(),
          );
          if (municipalityCode && province) {
            mapping.set(municipalityCode, province);
          }
        });
        setMunicipalityToProvince(mapping);
      })
      .catch((error: unknown) =>
        console.error("Could not load province mapping.", error),
      );
  }, [level]);

  return (
    <div style={{ position: "relative", height: "100vh" }}>
      <MapContainer
        center={[52.100917, 5.646265]}
        zoom={7.7}
        zoomSnap={0.1}
        zoomControl={false}
        style={{ height: "100%" }}
      >
        <MapFocus stations={focusStations} />
        <ZoomControl position="bottomleft" />
        {level === "national" ? null : level === "province" ? (
          <ProvinceMap
            provinces={provinces}
            features={provinceFeatures}
            onProvinceClick={onProvinceClick}
          />
        ) : level === "municipality" ? (
          <MunicipalityMap
            municipalities={municipalities}
            features={municipalityFeatures}
            onMunicipalityClick={onMunicipalityClick}
          />
        ) : (
          <StationMarkers
            stations={stations.filter(isMapVisibleStation)}
            view={view}
            onStationClick={onStationClick}
          />
        )}
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
      </MapContainer>
    </div>
  );
}

export default MapView;