import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Site } from "@/lib/store";
import { inr } from "@/lib/format";

function Fit({ sites }: { sites: Site[] }) {
  const map = useMap();
  useEffect(() => {
    if (!sites.length) return;
    if (sites.length === 1) map.setView([sites[0]!.lat, sites[0]!.lng], 13);
    else map.fitBounds(sites.map((s) => [s.lat, s.lng]) as [number, number][], { padding: [40, 40] });
  }, [sites, map]);
  return null;
}

export default function MapView({ sites, onOpen }: { sites: Site[]; onOpen: (id: string) => void }) {
  return (
    <MapContainer center={[22.5, 79]} zoom={5} className="h-[560px] w-full rounded-xl border border-line z-0">
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fit sites={sites} />
      {sites.map((s) => (
        <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={9} pathOptions={{ color: "#EA580C", fillColor: "#F97316", fillOpacity: 0.9 }}>
          <Popup><div className="text-[13px]"><b>{s.name}</b><br />{s.city} · {s.size}<br />{inr(s.monthlyRate)}/month<br />
            <button className="mt-2 text-[12px] font-semibold underline" onClick={() => onOpen(s.id)}>View rate card</button></div></Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
