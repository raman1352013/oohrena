import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Camera, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { actions, CATEGORIES, CITIES, currentVendorId, useStore, type Category, type WorkOrder } from "@/lib/store";
import { gpsPasses } from "@/lib/gst";
import { inr, left } from "@/lib/format";
import { proofSrc } from "@/lib/images";
import { useNow } from "@/hooks/use-now";
import { Avatar, Btn, Empty, Eyebrow, KCard, Pill } from "@/components/app/kit";

export const Route = createFileRoute("/vendor")({
  head: () => ({ meta: [
    { title: "Vendor Space Hub — OOHRENA" },
    { name: "description", content: "List media assets with GPS, manage work orders and upload day/night proof of display." },
    { property: "og:title", content: "Vendor Space Hub — OOHRENA" },
    { property: "og:description", content: "Media owners list sites and upload GPS-stamped proofs." },
  ] }),
  component: VendorHub,
});

function compress(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, 900 / img.width);
      const c = document.createElement("canvas"); c.width = img.width * sc; c.height = img.height * sc;
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
/** Simulated hardware GPS stamp: offset from the registered asset by a few metres (or far, to test rejection). */
function gpsStamp(site: { lat: number; lng: number }, offsite: boolean) {
  const m = offsite ? 120 + Math.random() * 200 : 5 + Math.random() * 35;
  const ang = Math.random() * Math.PI * 2;
  return { lat: site.lat + (m * Math.cos(ang)) / 111320, lng: site.lng + (m * Math.sin(ang)) / (111320 * Math.cos((site.lat * Math.PI) / 180)) };
}

function VendorHub() {
  const s = useStore((x) => x);
  const vid = currentVendorId(s.role) ?? "V-BM";
  const v = s.vendors.find((x) => x.id === vid)!;
  const wos = s.workOrders.filter((w) => w.vendorId === vid);
  const sites = s.sites.filter((x) => x.vendorId === vid);
  const pays = s.escrows.filter((e) => e.vendorId === vid);
  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <div className="flex items-center gap-3"><Avatar dark>{v.initials}</Avatar><div><Eyebrow>Vendor Space Hub</Eyebrow><h1 className="text-[22px] font-semibold">{v.name}</h1></div>
        <Pill tone={v.kyc === "verified" ? "verified" : "hold"} className="ml-auto">{v.kyc === "verified" ? "KYC Verified — GSTIN & PAN Active" : "KYC under review"}</Pill></div>
      {!currentVendorId(s.role) && <p className="text-[12px] text-mute">Viewing as Bundelkhand Media. Switch role in the header to act as another vendor.</p>}
      <KCard title="Assigned work orders" bodyClass="divide-y divide-line">
        {wos.length ? wos.map((w) => <WORow key={w.id} w={w} />) : <Empty title="No work orders assigned" hint="Work orders arrive when a client approves a quote for your site." />}
      </KCard>
      <div className="grid lg:grid-cols-2 gap-5">
        <AssetForm vendorId={vid} />
        <div className="space-y-5">
          <KCard title="My media assets" bodyClass="divide-y divide-line">
            {sites.map((x) => <div key={x.id} className="px-5 py-3 flex items-center gap-3 text-[13px]"><span className="font-mono text-[12px] w-16">{x.id}</span><span className="flex-1">{x.name}<span className="text-mute"> · {x.city}</span></span><span>{inr(x.monthlyRate)}/mo</span>
              <Pill tone={x.status === "live" ? "verified" : x.status === "pending" ? "hold" : "danger"}>{x.status === "live" ? "Live" : x.status === "pending" ? "In review" : "Rejected"}</Pill></div>)}
          </KCard>
          <KCard title="Payouts" bodyClass="divide-y divide-line">
            {pays.length ? pays.map((e) => <div key={e.id} className="px-5 py-3 flex items-center gap-3 text-[13px]"><span className="font-mono text-[12px]">{e.id}</span><span className="flex-1 text-mute">{e.woId}</span><span className="font-semibold">{inr(e.payout)}</span>
              <Pill tone={e.status === "released" ? "verified" : "hold"}>{e.status === "released" ? `Paid · ${e.utr}` : e.status === "held" ? "On hold" : "Awaiting checker"}</Pill></div>)
              : <Empty title="No payouts yet" hint="Escrow is released after proof certification." />}
          </KCard>
        </div>
      </div>
    </div>
  );
}

function WORow({ w }: { w: WorkOrder }) {
  const s = useStore((x) => x);
  const now = useNow();
  const site = s.sites.find((x) => x.id === w.siteId)!;
  const [offsite, setOffsite] = useState(false);
  const [busy, setBusy] = useState<string>();
  const locked = w.status === "certified" || w.status === "proof_submitted";
  async function upload(kind: "day" | "night", f?: File) {
    if (!f) return;
    if (!w.installer.trim()) return toast.error("Enter the installer name first");
    setBusy(kind);
    try {
      const img = await compress(f);
      await new Promise((r) => setTimeout(r, 900)); // acquiring GPS fix
      actions.submitProof(w.id, kind, img, gpsStamp(site, offsite));
      toast.success(`${kind === "day" ? "Day" : "Night"} proof uploaded with GPS stamp`);
    } catch { toast.error("Could not read that photo"); }
    setBusy(undefined);
    return undefined;
  }
  return (
    <div className="p-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <span className="font-mono text-[12px]">{w.id} <span className="text-mute">{w.bookingId}</span></span>
        <span className="font-semibold">{site.name}</span><span className="text-mute">{site.city} · {site.size}</span>
        <span className="ml-auto">{w.status === "certified" ? <Pill tone="verified">Certified · Live</Pill> : w.status === "proof_submitted" ? <Pill tone="hold">Under admin review</Pill> : w.status === "rejected" ? <Pill tone="danger">Rejected — re-upload</Pill> : <Pill tone="saffron">Mount by {left(w.deadline - now)}</Pill>}</span>
      </div>
      {w.status === "rejected" && <p className="text-[12px] text-destructive">Admin reason: {w.rejectReason}</p>}
      {!locked && (
        <div className="flex flex-wrap gap-3 items-center">
          <Input className="w-48 h-9" placeholder="Installer name" value={w.installer} onChange={(e) => actions.vendorUpdateWO(w.id, { installer: e.target.value })} />
          {(["day", "night"] as const).map((k) => (
            <label key={k} className={`h-9 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-2 cursor-pointer ${w[k] ? "border-verified text-verified" : "border-line bg-card"}`}>
              <Camera size={14} />{busy === k ? "Acquiring GPS…" : w[k] ? `${k === "day" ? "Day" : "Night"} ✓ ${w[k]!.distance}m` : `Capture ${k === "day" ? "Day" : "Night"} proof`}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => upload(k, e.target.files?.[0])} />
            </label>))}
          <label className="text-[12px] text-mute flex items-center gap-1"><input type="checkbox" checked={offsite} onChange={(e) => setOffsite(e.target.checked)} />Simulate off-site GPS</label>
        </div>)}
      {(w.day || w.night) && <div className="flex gap-3">{(["day", "night"] as const).map((k) => w[k] && (
        <div key={k} className="relative"><img src={proofSrc(w[k]!.image)} alt={k} className="h-20 w-32 object-cover rounded-md border border-line" />
          <span className={`absolute bottom-1 left-1 text-[10px] px-1.5 rounded flex items-center gap-0.5 ${gpsPasses(w[k]!.distance) ? "bg-verified text-primary-foreground" : "bg-destructive text-destructive-foreground"}`}><MapPin size={9} />{w[k]!.distance}m</span></div>))}</div>}
    </div>
  );
}

function AssetForm({ vendorId }: { vendorId: string }) {
  const empty = { name: "", city: "Gwalior", corridor: "", category: "Hoardings/Billboards" as Category, w: "", h: "", rate: "", print: "18", mounting: "12000", lat: "", lng: "", traffic: "" };
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<string>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  function captureGps() {
    if (!navigator.geolocation) { toast.error("GPS not available on this device"); return; }
    navigator.geolocation.getCurrentPosition((p) => setF((x) => ({ ...x, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })), () => toast.error("Location permission denied — enter coordinates manually"));
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const lat = Number(f.lat), lng = Number(f.lng), w = Number(f.w), h = Number(f.h), rate = Number(f.rate);
    if (f.name.trim().length < 3 || !f.corridor.trim()) return setErr("Add a site name and corridor.");
    if (!(lat > 6 && lat < 37 && lng > 68 && lng < 98)) return setErr("Enter GPS coordinates inside India.");
    if (!(w > 0 && h > 0 && rate > 0)) return setErr("Enter size and monthly rate.");
    setErr(undefined);
    actions.addSite({ name: f.name.trim(), city: f.city, corridor: f.corridor.trim(), category: f.category, size: `${w}×${h} ft`, sqft: w * h, monthlyRate: rate,
      printRate: Number(f.print) || 0, mounting: Number(f.mounting) || 0, lat, lng, vendorId, image: f.category === "Digital LED Screens" || f.category === "Retail Indoor" ? "led" : "day", illuminated: true, traffic: f.traffic || "—" });
    toast.success("Asset submitted · OOHRENA will review before listing");
    setF(empty);
    return undefined;
  }
  return (
    <KCard title="Upload media asset">
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <Input className="col-span-2" placeholder="Site name e.g. Phoolbagh Chowk Unipole" value={f.name} onChange={set("name")} />
        <select value={f.city} onChange={set("city")} className="h-9 rounded-md border border-line bg-card px-2 text-[13px]">{CITIES.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={f.category} onChange={set("category")} className="h-9 rounded-md border border-line bg-card px-2 text-[13px]">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <Input className="col-span-2" placeholder="Corridor / landmark" value={f.corridor} onChange={set("corridor")} />
        <Input placeholder="Width (ft)" type="number" value={f.w} onChange={set("w")} />
        <Input placeholder="Height (ft)" type="number" value={f.h} onChange={set("h")} />
        <Input placeholder="Latitude" value={f.lat} onChange={set("lat")} />
        <Input placeholder="Longitude" value={f.lng} onChange={set("lng")} />
        <button type="button" onClick={captureGps} className="col-span-2 text-[12px] text-saffron-deep font-medium flex items-center gap-1 justify-start"><MapPin size={13} />Use this device's GPS</button>
        <Input placeholder="Monthly rent (₹)" type="number" value={f.rate} onChange={set("rate")} />
        <Input placeholder="Daily traffic (optional)" value={f.traffic} onChange={set("traffic")} />
        <label className="text-[11px] text-mute">Print ₹/sq.ft<Input type="number" value={f.print} onChange={set("print")} /></label>
        <label className="text-[11px] text-mute">Mounting ₹<Input type="number" value={f.mounting} onChange={set("mounting")} /></label>
        {err && <p className="col-span-2 text-[12px] text-destructive">{err}</p>}
        <Btn type="submit" className="col-span-2">Submit for review</Btn>
      </form>
    </KCard>
  );
}
