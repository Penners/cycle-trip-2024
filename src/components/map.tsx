"use client";
import { Activities } from "@/types";
import "leaflet/dist/leaflet.css";
import prettyMilliseconds from "pretty-ms";
import { useState } from "react";
import {
  LayerGroup,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
} from "react-leaflet";

const Map: React.FC<{ data: Activities[] }> = ({ data }) => {
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  let totalDistance = data.reduce((prev, pos) => {
    return pos.dm + prev;
  }, 0);
  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
      }}
    >
      <div
        className="fixed left-[50%] translate-x-[-50%] top-4 block bg-white p-2 rounded"
        style={{ zIndex: 999999999 }}
      >
        Total Distance: {Math.round(totalDistance / 1000)} km
      </div>
      <MapContainer
        zoom={9}
        scrollWheelZoom={true}
        className="h-full w-full"
        style={{
          width: "100%",
          height: "100%",
        }}
        center={[51.6070426, 4.0596215]}
      >
        <TileLayer url="	https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {data.map((pos) => {
          let color = "Blue";
          if (pos.s !== "Biking") {
            color = "Orange";
          }
          if (selectedLine === pos.st) {
            console.log("render red line", pos.st);
            color = "Red";
          }
          return (
            <Polyline
              eventHandlers={{
                click: () => {
                  setSelectedLine(pos.st);
                },
              }}
              pathOptions={{ color }}
              key={pos.st}
              positions={pos.p.map((x) => {
                return {
                  lat: x.lt,
                  lng: x.lg,
                };
              })}
            >
              <Popup>
                <div>Activity: {pos.s}</div>
                <div>Distance: {Math.round(pos.dm / 1000)} km</div>
                <div>Duration: {prettyMilliseconds(pos.tt * 1000)}</div>
              </Popup>
            </Polyline>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default Map;
