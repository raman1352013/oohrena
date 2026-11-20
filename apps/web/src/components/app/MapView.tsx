import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";

export type MapPoint = { id: string; lat: number; lng: number; title: string; subtitle: string; price: string };

function Fit({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView([points[0]!.lat, points[0]!.lng], 13);
    else map.fitBounds(points.map((s) => [s.lat, s.lng]) as [number, number][], { padding: [40, 40] });
  }, [points, map]);
  return null;
}

/** Map of the same result set the list shows (list and map stay in sync). */
export default function MapView({ points, onOpen }: { points: MapPoint[]; onOpen: (id: string) => void }) {
  return (
    <MapContainer center={[22.5, 79]} zoom={5} className="h-[560px] w-full rounded-xl border border-line z-0">
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fit points={points} />
      {points.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={9} pathOptions={{ color: "#EA580C", fillColor: "#F97316", fillOpacity: 0.9 }}>
          <Popup><div className="text-[13px]"><b>{p.title}</b><br />{p.subtitle}<br />{p.price}<br />
            <button className="mt-2 text-[12px] font-semibold underline" onClick={() => onOpen(p.id)}>View details</button></div></Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
