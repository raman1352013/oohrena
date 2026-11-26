import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  CheckCircle2,
  Heart,
  LayoutGrid,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Search,
  X,
} from "lucide-react";
import {
  CATEGORY_DEFS,
  PRICING_UNIT_LABEL,
  SUBJECT_TO_VENDOR,
  categoryDef,
  leadCreateInput,
  type PublicListing,
  CATEGORY_IDS,
  type CategoryId,
} from "@oohrena/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/lib/auth";
import { inr, fmtDate } from "@/lib/format";
import {
  useCalendar,
  useCompare,
  useCreateLead,
  useSearch,
  useShortlist,
  useToggleShortlist,
  type SearchItem,
} from "@/lib/marketplace-api";
import { cn } from "@/lib/utils";
import { Btn, Empty, Photo, Pill, Row } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { AvailabilityCalendar } from "@/components/app/AvailabilityCalendar";

const MapView = lazy(() => import("@/components/app/MapView"));

export const Route = createFileRoute("/marketplace")({
  validateSearch: (
    s: Record<string, unknown>,
  ): { category?: CategoryId | undefined; city?: string | undefined } => {
    const city = typeof s["city"] === "string" ? s["city"].trim().slice(0, 80) : "";
    return {
      ...(CATEGORY_IDS.includes(s["category"] as CategoryId)
        ? { category: s["category"] as CategoryId }
        : {}),
      ...(city ? { city } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Media — OOHRENA" },
      {
        name: "description",
        content:
          "Search verified hoardings, LED screens, transit and retail media by city, locality, landmark, PIN or map. Check dates and request an itemised quote.",
      },
      { property: "og:title", content: "OOHRENA Media Marketplace" },
      {
        property: "og:description",
        content: "Verified outdoor and digital media with honest, date-wise availability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Marketplace,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => iso(new Date(Date.now() + n * 86_400_000));
const priceText = (l: PublicListing) =>
  l.indicativePrice
    ? `${inr(l.indicativePrice)} ${PRICING_UNIT_LABEL[l.pricingUnit]}`
    : "Price on request";

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

function Marketplace() {
  const { data: user } = useSession();
  const isClient = user?.role === "client";
  const [query, setQuery] = useState("");
  const initial = Route.useSearch();
  const [city, setCity] = useState(initial.city ?? "");
  const [cat, setCat] = useState<string>(initial.category ?? "");
  const [budget, setBudget] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [point, setPoint] = useState<{ lat: number; lng: number }>();
  const [radius, setRadius] = useState(10);
  const [view, setView] = useState<"grid" | "map">("grid");
  const [open, setOpen] = useState<SearchItem>();
  const [compare, setCompare] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);

  const datesOk = !!from && !!to && to >= from;
  const params = useDebounced({
    q: query.trim() || undefined,
    city: city.trim() || undefined,
    category: cat || undefined,
    maxPrice: budget ? Number(budget) : undefined,
    from: datesOk ? from : undefined,
    to: datesOk ? to : undefined,
    onlyAvailable: datesOk && onlyAvailable,
    lat: point?.lat,
    lng: point?.lng,
    radiusKm: point ? radius : undefined,
  });
  const search = useSearch(params);
  const shortlist = useShortlist(isClient);
  const toggle = useToggleShortlist();
  const savedIds = useMemo(
    () => new Set((shortlist.data ?? []).map((s) => s.inventoryId)),
    [shortlist.data],
  );
  const items = (search.data?.items ?? []).filter((x) => !savedOnly || savedIds.has(x.inventoryId));

  function save(id: string) {
    if (!isClient) return toast.message("Sign in with a client account to keep a shortlist");
    toggle.mutate({ id, on: !savedIds.has(id) }, { onError: (e) => toast.error(e.message) });
    return undefined;
  }
  function locate() {
    if (!navigator.geolocation) return toast.error("Location isn't available on this device");
    navigator.geolocation.getCurrentPosition(
      (p) => setPoint({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => toast.error("Location permission denied"),
    );
    return undefined;
  }

  return (
    <div>
      <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6">
        <h1 className="text-2xl font-semibold mb-4">Media</h1>
        <div className="grid md:grid-cols-[1fr_160px_150px_150px_150px] gap-3 mb-3">
          <label className="relative">
            <Search size={15} className="absolute left-3 top-3 text-mute" />
            <Input
              aria-label="Search"
              placeholder="Locality, landmark, PIN code or Inventory ID"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <Input
            aria-label="City"
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <Input
            aria-label="Maximum price"
            type="number"
            min={0}
            placeholder="Max price ₹"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <Input
            aria-label="Campaign start"
            type="date"
            min={plus(0)}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              if (!to || e.target.value > to)
                setTo(iso(new Date(Date.parse(e.target.value) + 29 * 86_400_000)));
            }}
          />
          <Input
            aria-label="Campaign end"
            type="date"
            min={from || plus(0)}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 mb-4 text-[12px]">
          <Btn variant={point ? "dark" : "secondary"} className="h-9 px-3" onClick={locate}>
            <LocateFixed size={14} />
            {point ? "Near me" : "Near me"}
          </Btn>
          {point && (
            <>
              <select
                aria-label="Radius"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="h-9 bg-card border border-line rounded-md px-2"
              >
                {[2, 5, 10, 25, 50].map((km) => (
                  <option key={km} value={km}>
                    {km} km
                  </option>
                ))}
              </select>
              <button
                aria-label="Clear location"
                onClick={() => setPoint(undefined)}
                className="text-mute"
              >
                <X size={15} />
              </button>
            </>
          )}
          {datesOk && (
            <label className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-line bg-card cursor-pointer">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
              />
              Only free for my dates
            </label>
          )}
          {isClient && (
            <>
              <Btn
                variant={savedOnly ? "dark" : "secondary"}
                className="h-9 px-3"
                onClick={() => setSavedOnly(!savedOnly)}
              >
                <Heart size={14} />
                Shortlist ({savedIds.size})
              </Btn>
              <Btn
                variant="secondary"
                className="h-9 px-3"
                disabled={savedIds.size < 2}
                onClick={() => setCompare(true)}
              >
                Compare
              </Btn>
            </>
          )}
          <span className="ml-auto text-mute">
            {search.isFetching
              ? "Searching…"
              : `${items.length} result${items.length === 1 ? "" : "s"}`}
            {datesOk ? ` · ${fmtDay(from)} – ${fmtDay(to)}` : ""}
          </span>
          <div className="flex rounded-lg border border-line bg-card p-0.5">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "h-7 px-3 rounded-md flex items-center gap-1",
                view === "grid" && "bg-navy text-navy-foreground",
              )}
            >
              <LayoutGrid size={13} />
              List
            </button>
            <button
              onClick={() => setView("map")}
              className={cn(
                "h-7 px-3 rounded-md flex items-center gap-1",
                view === "map" && "bg-navy text-navy-foreground",
              )}
            >
              <MapIcon size={13} />
              Map
            </button>
          </div>
        </div>
        <div className="flex gap-6 border-b border-line text-[13px] overflow-x-auto">
          {[{ id: "", name: "All media" }, ...CATEGORY_DEFS].map((c) => (
            <button
              key={c.id || "all"}
              onClick={() => setCat(c.id)}
              className={cn(
                "pt-2 pb-2.5 border-b-2 whitespace-nowrap",
                cat === c.id ? "border-navy font-semibold" : "border-transparent text-mute",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {search.isError ? (
            <div className="py-16 text-center text-[13px]">
              <div className="text-destructive">{search.error.message}</div>
              <Btn variant="secondary" className="mt-3" onClick={() => void search.refetch()}>
                Try again
              </Btn>
            </div>
          ) : search.isPending ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-80 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : !items.length ? (
            <Empty title={savedOnly ? "Shortlist is empty" : "No media found"} />
          ) : view === "map" ? (
            <Suspense fallback={<div className="h-[560px] rounded-xl bg-muted animate-pulse" />}>
              <MapView
                points={items.map((x) => ({
                  id: x.inventoryId,
                  lat: x.lat,
                  lng: x.lng,
                  title: x.title,
                  subtitle: `${x.locality}, ${x.city}`,
                  price: priceText(x),
                }))}
                onOpen={(id) => setOpen(items.find((x) => x.inventoryId === id))}
              />
            </Suspense>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {items.map((x) => (
                <ListingCard
                  key={x.inventoryId}
                  x={x}
                  saved={savedIds.has(x.inventoryId)}
                  onSave={() => save(x.inventoryId)}
                  onOpen={() => setOpen(x)}
                />
              ))}
            </div>
          )}
          {search.data?.truncated && (
            <p className="text-[12px] text-mute mt-4">Showing the first 500.</p>
          )}
        </div>
      </div>

      <ListingDialog
        item={open}
        onClose={() => setOpen(undefined)}
        from={datesOk ? from : undefined}
        to={datesOk ? to : undefined}
        saved={!!open && savedIds.has(open.inventoryId)}
        onSave={() => open && save(open.inventoryId)}
      />
      <CompareDialog
        open={compare}
        onClose={() => setCompare(false)}
        ids={[...savedIds].slice(0, 4)}
      />
    </div>
  );
}

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

function AvailabilityPill({ a }: { a: SearchItem["availability"] }) {
  if (!a) return null;
  if (a.state === "unavailable") return <Pill tone="neutral">Not available for these dates</Pill>;
  if (a.state === "limited") return <Pill tone="hold">Partly available</Pill>;
  return (
    <Pill tone={a.confirmed ? "verified" : "hold"}>
      {a.confirmed
        ? `Available${a.capacity > 1 ? ` · ${a.minFree} ${a.unitLabel}` : ""}`
        : `Available · ${SUBJECT_TO_VENDOR.toLowerCase()}`}
    </Pill>
  );
}

function ListingCard({
  x,
  saved,
  onSave,
  onOpen,
}: {
  x: SearchItem;
  saved: boolean;
  onSave: () => void;
  onOpen: () => void;
}) {
  return (
    <article className="bg-card border border-line rounded-xl overflow-hidden hover:border-saffron transition min-w-0 flex flex-col">
      <button onClick={onOpen} className="text-left">
        <Photo src={x.photos[0]} alt={x.title} className="h-44 w-full" />
      </button>
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{x.title}</div>
            <div className="text-[12px] text-mute flex items-center gap-1 mt-0.5">
              <MapPin size={12} />
              {x.locality}, {x.city}
              {x.distanceKm !== undefined && ` · ${x.distanceKm} km`}
            </div>
          </div>
          {x.dataType === "DEMO" ? (
            <Pill tone="hold">DEMO · not bookable</Pill>
          ) : (
            x.verified && (
              <Pill tone="verified">
                <BadgeCheck size={12} />
                Verified
              </Pill>
            )
          )}
        </div>
        <div className="mt-3">
          <AvailabilityPill a={x.availability} />
        </div>
        <div className="flex justify-between mt-3 text-[13px]">
          <span className="text-mute">{x.categoryName}</span>
          <span className="font-semibold">{priceText(x)}</span>
        </div>
        <div className="flex items-center justify-between mt-auto pt-3">
          <Btn variant="secondary" className="h-9 px-3" onClick={onOpen}>
            View details
          </Btn>
          <Btn
            variant={saved ? "dark" : "ghost"}
            className="h-9 w-9 p-0"
            aria-label={`${saved ? "Remove from" : "Add to"} shortlist`}
            onClick={onSave}
          >
            <Heart size={16} />
          </Btn>
        </div>
      </div>
    </article>
  );
}

function ListingDialog({
  item,
  onClose,
  from,
  to,
  saved,
  onSave,
}: {
  item: SearchItem | undefined;
  onClose: () => void;
  from?: string | undefined;
  to?: string | undefined;
  saved: boolean;
  onSave: () => void;
}) {
  const calFrom = from ?? plus(0);
  const calTo =
    to && Date.parse(to) - Date.parse(calFrom) < 120 * 86_400_000
      ? to
      : iso(new Date(Date.parse(calFrom) + 59 * 86_400_000));
  const cal = useCalendar(item?.inventoryId, calFrom, calTo);
  const [ask, setAsk] = useState(false);
  useEffect(() => setAsk(false), [item?.inventoryId]);
  if (!item) return null;
  const def = categoryDef(item.category);
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="flex gap-1 overflow-x-auto bg-muted">
          {item.photos.length ? (
            item.photos.map((p) => (
              <Photo key={p} src={p} alt={item.title} className="h-56 min-w-[70%] sm:min-w-[50%]" />
            ))
          ) : (
            <Photo src={undefined} alt="" className="h-40 w-full" />
          )}
        </div>
        <div className="p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-xl flex flex-wrap items-center gap-2">
              {item.title}
              {item.dataType === "DEMO" ? (
                <Pill tone="hold">DEMO · not bookable</Pill>
              ) : (
                item.verified && (
                  <Pill tone="verified">
                    <BadgeCheck size={12} />
                    Verified by OOHRENA
                  </Pill>
                )
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="text-[13px] text-mute -mt-2">
            {[item.landmark, item.locality, item.city, item.pin].filter(Boolean).join(", ")} ·{" "}
            <span className="font-mono">{item.inventoryId}</span>
          </div>
          {item.description && <p className="text-[13px]">{item.description}</p>}
          <div className="grid sm:grid-cols-2 gap-x-8 divide-y sm:divide-y-0 divide-line">
            <div>
              <Row k="Category" v={item.categoryName} />
              {def?.attributes.map(
                (a) =>
                  item.attributes[a.key] !== undefined && (
                    <Row
                      key={a.key}
                      k={a.label}
                      v={
                        typeof item.attributes[a.key] === "boolean"
                          ? item.attributes[a.key]
                            ? "Yes"
                            : "No"
                          : `${String(item.attributes[a.key])}${"unit" in a && a.unit ? ` ${a.unit}` : ""}`
                      }
                    />
                  ),
              )}
              <Row k="Quantity" v={item.quantity} />
            </div>
            <div>
              <Row k="Indicative price" v={priceText(item)} />
              <Row k="Location" v={`${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`} />
              <Row k="Last updated" v={fmtDate(item.updatedAt)} />
            </div>
          </div>

          <section className="border-t border-line pt-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <div className="font-semibold text-[14px] mr-auto">
                Availability {fmtDay(calFrom)} – {fmtDay(calTo)}
              </div>
              {cal.data && (
                <span className="text-[12px] text-mute">
                  Updated {fmtDate(cal.data.summary.lastUpdatedAt)}
                  {cal.data.minDays > 1 ? ` · min ${cal.data.minDays} days` : ""}
                </span>
              )}
            </div>
            {cal.isPending ? (
              <div className="h-40 rounded-lg bg-muted animate-pulse" />
            ) : cal.isError ? (
              <p className="text-[13px] text-destructive">{cal.error.message}</p>
            ) : (
              <>
                {cal.data.note && (
                  <Pill tone="hold" className="mb-2">
                    {cal.data.note}
                  </Pill>
                )}
                <AvailabilityCalendar
                  days={cal.data.days}
                  unitLabel={cal.data.unitLabel}
                  showUnits={cal.data.capacityModel !== "period"}
                />
              </>
            )}
          </section>

          {ask ? (
            <InquiryForm item={item} from={from} to={to} onDone={onClose} />
          ) : (
            <div className="flex gap-2">
              <Btn className="flex-1" disabled={!item.bookable} onClick={() => setAsk(true)}>
                {item.bookable ? "Request quotation" : "Not bookable"}
              </Btn>
              <Btn variant={saved ? "dark" : "secondary"} onClick={onSave}>
                <Heart size={15} />
                {saved ? "Shortlisted" : "Shortlist"}
              </Btn>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InquiryForm({
  item,
  from,
  to,
  onDone,
}: {
  item: SearchItem;
  from?: string | undefined;
  to?: string | undefined;
  onDone: () => void;
}) {
  const { data: user } = useSession();
  const create = useCreateLead();
  const [f, setF] = useState({
    from: from ?? plus(7),
    to: to ?? plus(36),
    qty: "1",
    budget: "",
    requirement: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [done, setDone] = useState<string>();

  if (!user) {
    return (
      <div className="rounded-lg border border-line p-4 text-[13px] flex flex-wrap items-center gap-3">
        <span className="flex-1">
          Sign in with your advertiser account to request a quotation. You'll get a Lead ID to track
          it.
        </span>
        <Link to="/login" search={{ redirect: "/marketplace" }}>
          <Btn variant="secondary" className="h-9">
            Sign in
          </Btn>
        </Link>
        <Link to="/register">
          <Btn className="h-9">Create account</Btn>
        </Link>
      </div>
    );
  }
  if (user.role !== "client")
    return (
      <p className="text-[13px] text-mute">Sign in with a client account to request a quote.</p>
    );
  if (done) {
    return (
      <div className="rounded-lg border border-verified/30 bg-verified-soft p-4 text-center">
        <CheckCircle2 className="mx-auto text-verified" size={32} />
        <div className="font-semibold mt-2">Inquiry received</div>
        <p className="font-mono text-[15px] mt-1">{done}</p>
        <div className="flex justify-center gap-2 mt-3">
          <Btn variant="secondary" className="h-9" onClick={onDone}>
            Keep browsing
          </Btn>
          <Link to="/client">
            <Btn className="h-9">Track it</Btn>
          </Link>
        </div>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const p = leadCreateInput.safeParse({
      inventoryIds: [item.inventoryId],
      from: f.from,
      to: f.to,
      qty: f.qty,
      budget: f.budget || undefined,
      requirement: f.requirement,
    });
    if (!p.success) {
      setErrors(Object.fromEntries(p.error.issues.map((i) => [i.path.join("."), i.message])));
      return;
    }
    setErrors({});
    create.mutate(p.data, {
      onSuccess: (l) => {
        setDone(l.leadId);
        toast.success(`Inquiry ${l.leadId} submitted`);
      },
      onError: (err) => setFormError(err.message),
    });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="border-t border-line pt-4 grid sm:grid-cols-2 gap-3 text-[13px]"
    >
      <div className="sm:col-span-2 font-semibold text-[14px]">Request a quotation</div>
      {formError && (
        <div className="sm:col-span-2">
          <FormError message={formError} />
        </div>
      )}
      <Field
        id="lf"
        label="Start date"
        type="date"
        min={plus(0)}
        value={f.from}
        error={errors["from"]}
        onChange={(e) => setF({ ...f, from: e.target.value })}
      />
      <Field
        id="lt"
        label="End date"
        type="date"
        min={f.from}
        value={f.to}
        error={errors["to"]}
        onChange={(e) => setF({ ...f, to: e.target.value })}
      />
      {item.quantity > 1 && (
        <Field
          id="lq"
          label={`Quantity (of ${item.quantity})`}
          inputMode="numeric"
          value={f.qty}
          error={errors["qty"]}
          onChange={(e) => setF({ ...f, qty: e.target.value })}
        />
      )}
      <Field
        id="lb"
        label="Budget (₹)"
        inputMode="numeric"
        value={f.budget}
        error={errors["budget"]}
        onChange={(e) => setF({ ...f, budget: e.target.value })}
      />
      <div className="sm:col-span-2 space-y-1.5">
        <label htmlFor="lr" className="font-medium">
          What do you need?
        </label>
        <Textarea
          id="lr"
          rows={3}
          value={f.requirement}
          onChange={(e) => setF({ ...f, requirement: e.target.value })}
        />
        {errors["requirement"] && (
          <p className="text-[12px] text-destructive">{errors["requirement"]}</p>
        )}
      </div>
      <Btn type="submit" className="sm:col-span-2" disabled={create.isPending}>
        {create.isPending ? "Submitting…" : "Submit inquiry"}
      </Btn>
    </form>
  );
}

function CompareDialog({
  open,
  onClose,
  ids,
}: {
  open: boolean;
  onClose: () => void;
  ids: string[];
}) {
  const cmp = useCompare(open ? ids : []);
  const rows: [string, (l: PublicListing) => string][] = [
    ["City", (l) => `${l.locality}, ${l.city}`],
    ["Category", (l) => l.categoryName],
    ["Indicative price", priceText],
    ["Quantity", (l) => String(l.quantity)],
    [
      "Size",
      (l) =>
        l.attributes["widthFt"]
          ? `${String(l.attributes["widthFt"])} × ${String(l.attributes["heightFt"])} ft`
          : "—",
    ],
    ["Verified", (l) => (l.verified ? "Yes" : "No")],
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compare</DialogTitle>
        </DialogHeader>
        {cmp.isPending ? (
          <div className="h-40 bg-muted rounded-lg animate-pulse" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[540px]">
              <thead>
                <tr>
                  <th className="text-left p-3" />
                  {(cmp.data ?? []).map((x) => (
                    <th key={x.inventoryId} className="text-left p-3 align-top">
                      {x.title}
                      <div className="font-mono text-[11px] text-mute font-normal">
                        {x.inventoryId}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, fn]) => (
                  <tr key={label} className="border-t border-line">
                    <td className="p-3 text-mute">{label}</td>
                    {(cmp.data ?? []).map((x) => (
                      <td key={x.inventoryId} className="p-3">
                        {fn(x)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
