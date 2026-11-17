import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { LayoutGrid, Map as MapIcon, MapPin, Lock } from "lucide-react";
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
    { property: "og:description", content: "Ab Advertising Sirf Dikhegi Nahi... Track Bhi Hogi!" },
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
  const list = s.sites.filter((x) => x.status === "live" && (!city || x.city === city) && (!cat || x.category === cat));
  const site = s.sites.find((x) => x.id === open);
  const avail = (x: Site) => x.bookedUntil && x.bookedUntil > now ? { tone: "neutral" as const, t: `Booked till ${new Date(x.bookedUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` }
    : x.holdUntil && x.holdUntil > now ? { tone: "hold" as const, t: `On 48h hold · ${left(x.holdUntil - now)}` } : { tone: "verified" as const, t: "Available" };

  return (
    <div>
      <section className="bg-card border-b border-line">
        <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-10 flex flex-wrap items-center gap-8">
          <div className="flex-1 min-w-72">
            <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.2em] text-mute uppercase"><PinLogo size={20} />Outdoor x Digital x Trackable</div>
            <h1 className="text-3xl md:text-4xl font-bold mt-3 leading-tight">360° outdoor & digital media,<br />booked with proof you can verify.</h1>
            <p className="text-saffron-deep font-semibold mt-3">Ab Advertising Sirf Dikhegi Nahi... Track Bhi Hogi!</p>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center">
            {[["Live sites", list.length || s.sites.filter((x) => x.status === "live").length], ["Pilot cities", 5], ["GPS-verified", "Day+Night"]].map(([k, v]) => (
              <div key={k as string}><div className="text-2xl font-bold">{v}</div><div className="text-[12px] text-mute">{k}</div></div>))}
          </div>
        </div>
      </section>

      <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6">
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
                  <button key={x.id} onClick={() => { setOpen(x.id); setMonths(1); }} className="text-left bg-card border border-line rounded-xl overflow-hidden hover:border-saffron transition">
                    <img src={img(x)} alt={x.name} loading="lazy" className="h-44 w-full object-cover" />
                    <div className="p-4">
                      <div className="flex items-start gap-2"><div className="flex-1"><div className="font-semibold">{x.name}</div><div className="text-[12px] text-mute flex items-center gap-1 mt-0.5"><MapPin size={12} />{x.corridor}, {x.city}</div></div><Pill tone={a.tone}>{a.t}</Pill></div>
                      <div className="flex justify-between mt-4 text-[13px]"><span className="text-mute">{x.category.split("/")[0]} · {x.size}</span><span className="font-semibold">{inr(x.monthlyRate)}<span className="text-mute font-normal">/mo</span></span></div>
                    </div>
                  </button>); })}
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
                <div><Row k="Category" v={site.category} /><Row k="Size" v={`${site.size} · ${site.sqft} sq.ft`} /><Row k="Traffic" v={site.traffic} /><Row k="Illumination" v={site.illuminated ? "Front-lit" : "Non-lit"} /><Row k="Vendor" v={<span className="inline-flex items-center gap-1">{s.vendors.find((v) => v.id === site.vendorId)?.name}<Pill tone="verified">KYC</Pill></span>} /></div>
                <RateCard site={site} months={months} setMonths={setMonths} />
              </div>
              {(() => { const a = avail(site); return a.tone !== "verified" && <p className="mt-4 text-[12px] text-mute flex items-center gap-1"><Lock size={12} />{a.t}. You can still request a quote for later dates.</p>; })()}
              <Btn className="w-full mt-5" onClick={() => setReq(true)}>Request Quotation</Btn>
            </div>
          </DialogContent>
        )}
      </Dialog>
      <RequestQuoteDialog site={site} months={months} open={req} onOpenChange={(v) => { setReq(v); if (!v) setOpen(undefined); }} />
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
