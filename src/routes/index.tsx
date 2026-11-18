import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { LayoutGrid, Map as MapIcon, MapPin, Lock, Heart, Search, LocateFixed, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { matchesDiscovery } from "@/lib/discovery";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CATEGORIES, CITIES, useStore, type Site } from "@/lib/store";
import { computeQuote } from "@/lib/gst";
import { inr, left } from "@/lib/format";
import { SITE_IMG } from "@/lib/images";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { Btn, Empty, Pill, PinLogo, Row } from "@/components/app/kit";
import { RequestQuoteDialog } from "@/components/app/RequestQuoteDialog";

const MapView = lazy(() => import("@/components/app/MapView"));

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "OOHRENA Media Marketplace — Hoardings, LED, Transit across India" },
    { name: "description", content: "Browse hoardings, digital LED screens, transit and gantry media in Delhi, Mumbai, Bengaluru, Hyderabad and Chennai. Request a GST quote in one click." },
    { property: "og:title", content: "OOHRENA Media Marketplace" },
     { property: "og:description", content: "Explore sample outdoor media and compare indicative campaign costs." },
     { property: "og:type", content: "website" },
     { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Marketplace,
});

const img = (s: Site) => SITE_IMG[s.image];

function Marketplace() {
  const s = useStore((x) => x);
  const now = useNow();
  const [city, setCity] = useState("");
  const [cat, setCat] = useState("");
  const [view, setView] = useState<"grid" | "map">("grid");
  const [open, setOpen] = useState<string>();
  const [months, setMonths] = useState(1);
  const [req, setReq] = useState(false);
  const [query, setQuery] = useState("");
  const [budget, setBudget] = useState("");
  const [point, setPoint] = useState<{ lat: number; lng: number }>();
  const [radius, setRadius] = useState(5);
  const [shortlist, setShortlist] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [compare, setCompare] = useState(false);
  const saved = s.sites.filter((x) => shortlist.includes(x.id));
  const list = s.sites.filter((x) => matchesDiscovery(x, { query, min: 0, max: budget ? Number(budget) : Infinity, point, radiusKm: radius }) && (!city || x.city === city) && (!cat || x.category === cat) && (!savedOnly || shortlist.includes(x.id)));
  const site = s.sites.find((x) => x.id === open);
  const avail = (x: Site) => x.bookedUntil && x.bookedUntil > now ? { tone: "neutral" as const, t: `Booked till ${new Date(x.bookedUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` }
    : x.holdUntil && x.holdUntil > now ? { tone: "hold" as const, t: `Demo hold · ${left(x.holdUntil - now)}` } : { tone: "neutral" as const, t: "Not bookable · sample" };

  function toggleSave(id: string) {
    setShortlist((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }
  function locate() {
    if (!navigator.geolocation) return toast.error("Location unavailable on this device");
    navigator.geolocation.getCurrentPosition((position) => setPoint({ lat: position.coords.latitude, lng: position.coords.longitude }), () => toast.error("Location permission denied"));
    return undefined;
  }

  return (
    <div>
      <section className="bg-card border-b border-line">
        <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-10 flex flex-wrap items-center gap-8">
          <div className="flex-1 min-w-72">
            <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.2em] text-mute uppercase"><PinLogo size={20} />Outdoor x Digital x Trackable</div>
            <h1 className="text-3xl md:text-4xl font-bold mt-3 leading-tight">OOHRENA Media Marketplace</h1>
            <p className="text-saffron-deep font-semibold mt-3">Ab Advertising Sirf Dikhegi Nahi... Track Bhi Hogi!</p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:gap-6 text-center w-full sm:w-auto min-w-0">
            {[["Sample results", list.length], ["Demo cities", new Set(s.sites.map((x) => x.city)).size], ["Proof samples", "Day+Night"]].map(([k, v]) => (
               <div key={k as string} className="min-w-0"><div className="text-xl sm:text-2xl font-bold">{v}</div><div className="text-[12px] text-mute">{k}</div></div>))}
          </div>
        </div>
      </section>

      <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6">
        <div className="grid sm:grid-cols-[1fr_180px_auto] gap-3 mb-4">
          <label className="relative"><Search size={15} className="absolute left-3 top-3 text-mute" /><Input aria-label="Search media location" placeholder="City, locality, landmark or inventory ID" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          <Input aria-label="Maximum monthly budget" type="number" min={0} placeholder="Max monthly budget ₹" value={budget} onChange={(e) => setBudget(e.target.value)} />
          <Btn variant="secondary" onClick={locate}><LocateFixed size={15} />Near me</Btn>
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4 text-[12px]">
          {point && <><label>Radius <select aria-label="Search radius" value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="bg-card border border-line rounded-md p-2">{[5, 10, 25, 50].map((km) => <option key={km} value={km}>{km} km</option>)}</select></label><Btn variant="ghost" aria-label="Clear location" onClick={() => setPoint(undefined)}><X size={15} /></Btn></>}
          <Btn variant={savedOnly ? "dark" : "secondary"} className="h-9 px-3" onClick={() => setSavedOnly(!savedOnly)}><Heart size={14} />Shortlist ({saved.length})</Btn>
          <Btn variant="secondary" className="h-9 px-3" disabled={saved.length < 2} onClick={() => setCompare(true)}>Compare ({saved.length})</Btn>
          <span className="ml-auto text-mute">{list.length} sample results · Subject to vendor confirmation</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {["", ...CITIES].map((c) => (
            <button key={c || "all"} onClick={() => setCity(c)} className={cn("h-8 px-3 rounded-lg border text-[12px] font-medium", city === c ? "bg-navy text-navy-foreground border-navy" : "bg-card border-line")}>{c || "All cities"}</button>
          ))}
          <div className="ml-auto flex rounded-lg border border-line bg-card p-0.5">
            <button onClick={() => setView("grid")} className={cn("h-7 px-3 rounded-md text-[12px] flex items-center gap-1", view === "grid" && "bg-navy text-navy-foreground")}><LayoutGrid size={13} />Grid</button>
            <button onClick={() => setView("map")} className={cn("h-7 px-3 rounded-md text-[12px] flex items-center gap-1", view === "map" && "bg-navy text-navy-foreground")}><MapIcon size={13} />Map</button>
          </div>
        </div>
        <div className="flex gap-6 border-b border-line text-[13px] mt-4 overflow-x-auto">
          {["", ...CATEGORIES].map((c) => (
            <button key={c || "all"} onClick={() => setCat(c)} className={cn("pt-2 pb-2.5 border-b-2 whitespace-nowrap", cat === c ? "border-navy font-semibold" : "border-transparent text-mute")}>{c || "All media"}</button>
          ))}
        </div>

        <div className="mt-5">
          {!list.length ? <Empty title="No media listed here yet" hint="Try another city or category — new vendor inventory is added every week." />
            : view === "map" ? <Suspense fallback={<div className="h-[560px] rounded-xl bg-muted animate-pulse" />}><MapView sites={list} onOpen={setOpen} /></Suspense>
            : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {list.map((x) => { const a = avail(x); return (
                  <article key={x.id} className="text-left bg-card border border-line rounded-xl overflow-hidden hover:border-saffron transition min-w-0">
                    <img src={img(x)} alt={x.name} loading="lazy" className="h-44 w-full object-cover" />
                    <div className="p-4">
                      <div className="flex flex-wrap items-start gap-2"><div className="flex-1 min-w-40"><div className="font-semibold">{x.name}</div><div className="text-[12px] text-mute flex items-center gap-1 mt-0.5"><MapPin size={12} />{x.corridor}, {x.city}</div></div><Pill tone={a.tone}>{a.t}</Pill></div>
                      <div className="flex justify-between mt-4 text-[13px]"><span className="text-mute">{x.category.split("/")[0]} · {x.size}</span><span className="font-semibold">{inr(x.monthlyRate)}<span className="text-mute font-normal">/mo</span></span></div>
                      <div className="flex items-center justify-between mt-3"><Btn variant="secondary" className="h-9 px-3" onClick={() => { setOpen(x.id); setMonths(1); }}>View details</Btn><Btn variant={shortlist.includes(x.id) ? "dark" : "ghost"} className="h-9 w-9 p-0" aria-label={`${shortlist.includes(x.id) ? "Remove" : "Shortlist"} ${x.name}`} onClick={() => toggleSave(x.id)}><Heart size={16} /></Btn></div>
                      <p className="text-[11px] text-mute mt-2">DEMO / SAMPLE · Snapshot {new Date(s.seededAt).toLocaleDateString("en-IN")}</p>
                    </div>
                  </article>); })}
              </div>
            )}
        </div>
      </div>

      <Dialog open={!!site && !req} onOpenChange={(v) => !v && setOpen(undefined)}>
        {site && (
          <DialogContent className="max-w-2xl p-0 overflow-hidden">
            <img src={img(site)} alt={site.name} className="h-56 w-full object-cover" />
            <div className="p-6">
              <DialogHeader><DialogTitle className="text-xl">{site.name}</DialogTitle></DialogHeader>
              <div className="text-[13px] text-mute">{site.corridor}, {site.city} · {site.id}</div>
              <div className="grid sm:grid-cols-2 gap-x-8 mt-4 divide-y sm:divide-y-0 divide-line">
                <div><Row k="Category" v={site.category} /><Row k="Size" v={`${site.size} · ${site.sqft} sq.ft`} /><Row k="Inventory ID" v={site.id} /><Row k="Illumination" v={site.illuminated ? "Front-lit" : "Non-lit"} /><Row k="Verification" v={<Pill>DEMO / SAMPLE</Pill>} /><Row k="Availability" v="Subject to vendor confirmation" /></div>
                <RateCard site={site} months={months} setMonths={setMonths} />
              </div>
              <p className="mt-4 text-[12px] text-mute flex items-center gap-1"><Lock size={12} />Sample inventory cannot be quoted or booked for a real campaign.</p>
               <Btn className="w-full mt-5" onClick={() => setReq(true)}>Try demo inquiry</Btn>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <RequestQuoteDialog site={site} months={months} open={req} onOpenChange={(v) => { setReq(v); if (!v) setOpen(undefined); }} />
      <Dialog open={compare} onOpenChange={setCompare}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>Compare shortlisted samples</DialogTitle></DialogHeader><div className="overflow-x-auto"><table className="w-full text-[13px] min-w-[540px]"><thead><tr><th className="text-left p-3">Specification</th>{saved.map((x) => <th key={x.id} className="text-left p-3">{x.name}</th>)}</tr></thead><tbody>{["City", "Category", "Size", "Monthly estimate", "Availability"].map((label, i) => <tr key={label} className="border-t border-line"><td className="p-3 text-mute">{label}</td>{saved.map((x) => <td key={x.id} className="p-3">{[x.city, x.category, x.size, inr(x.monthlyRate), "Sample · not bookable"][i]}</td>)}</tr>)}</tbody></table></div></DialogContent></Dialog>
    </div>
  );
}

function RateCard({ site, months, setMonths }: { site: Site; months: number; setMonths: (n: number) => void }) {
  const disc = months >= 6 ? 0.12 : months >= 3 ? 0.06 : 0;
  const base = Math.round(site.monthlyRate * months * (1 - disc));
  const c = computeQuote({ base, print: site.sqft * site.printRate, mounting: site.mounting });
  return (
    <div className="pt-3 sm:pt-0">
      <div className="flex rounded-lg border border-line p-0.5 text-[12px]">
        {[1, 3, 6].map((m) => <button key={m} onClick={() => setMonths(m)} className={cn("flex-1 h-7 rounded-md", months === m && "bg-navy text-navy-foreground font-semibold")}>{m} mo{m > 1 && ` · −${m >= 6 ? 12 : 6}%`}</button>)}
      </div>
      <Row k={`Media rent (${months} mo)`} v={inr(base)} />
      <Row k={`Printing @ ₹${site.printRate}/sq.ft`} v={inr(site.sqft * site.printRate)} />
      <Row k="Mounting" v={inr(site.mounting)} />
      <Row k="GST 18%" v={inr(c.gst)} />
      <div className="flex justify-between border-t border-line pt-2 font-semibold"><span>Estimated total</span><span>{inr(c.total)}</span></div>
      <p className="text-[11px] text-mute mt-1">Final itemized quote is issued by OOHRENA operations.</p>
    </div>
  );
}
