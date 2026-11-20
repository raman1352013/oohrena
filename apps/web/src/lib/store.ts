import { useSyncExternalStore } from "react";
import { computeQuote, distanceM, holdUntil, isHoldActive } from "./gst";

export type Role = "admin" | "vendor-bm" | "vendor-go" | "client" | "finance" | "partner";
export const ROLES: { id: Role; label: string; sub: string; home: string; initials: string }[] = [
  { id: "admin", label: "Admin", sub: "Central Operations Tower", home: "/admin", initials: "RK" },
  { id: "vendor-bm", label: "Vendor", sub: "Bundelkhand Media", home: "/vendor", initials: "RS" },
  { id: "vendor-go", label: "Vendor", sub: "Gwalior Outdoor", home: "/vendor", initials: "VT" },
  { id: "client", label: "Client", sub: "Tata Capital - Ananya Deshmukh", home: "/client", initials: "AD" },
  { id: "finance", label: "Finance", sub: "Meera Joshi Checker", home: "/finance", initials: "MJ" },
  { id: "partner", label: "Partner", sub: "City Growth Partner", home: "/partner", initials: "CP" },
];

export const CITIES = ["Delhi", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Gwalior", "Orai"];
export const CATEGORIES = ["Hoardings/Billboards", "Digital LED Screens", "E-Rickshaw/Promo Vans", "Bus/Metro Transit", "Gantry", "Retail Indoor"] as const;
export type Category = (typeof CATEGORIES)[number];

export type Vendor = { id: string; name: string; owner: string; initials: string; kyc: "verified" | "pending" | "rejected"; gstin: string; pan: string; city: string };
export type Site = {
  id: string; name: string; city: string; corridor: string; category: Category; size: string; sqft: number;
  monthlyRate: number; printRate: number; mounting: number; lat: number; lng: number; vendorId: string;
  image: "day" | "led" | "tower" | "night"; status: "live" | "pending" | "rejected"; holdUntil?: number | undefined; holdQuoteId?: string | undefined; bookedUntil?: number | undefined;
  illuminated: boolean; traffic: string;
};
export type LeadStatus = "new" | "quoted" | "revision" | "approved" | "rejected";
export type Lead = {
  id: string; client: string; contact: string; phone: string; email: string; city: string; corridor: string; media: string;
  siteId?: string | undefined; budget: number; durationDays: number; startDate: string; createdAt: number; slaMins: number;
  status: LeadStatus; quoteId?: string | undefined; source: "marketplace" | "partner" | "admin"; partner?: boolean | undefined; note?: string | undefined;
};
export type QuoteStatus = "draft" | "sent" | "approved" | "rejected" | "revision" | "expired";
export type Quote = {
  id: string; leadId: string; siteId: string; vendorId: string; base: number; print: number; mounting: number; payout: number;
  status: QuoteStatus; holdEnabled: boolean; sentAt?: number | undefined; holdUntil?: number | undefined; clientNote?: string | undefined; version: number;
};
export type Proof = { image: string; ts: number; lat: number; lng: number; distance: number };
export type WOStatus = "assigned" | "mounted" | "proof_submitted" | "certified" | "rejected";
export type WorkOrder = {
  id: string; bookingId: string; leadId: string; quoteId: string; siteId: string; vendorId: string; deadline: number;
  status: WOStatus; day?: Proof | undefined; night?: Proof | undefined; rejectReason?: string | undefined; installer: string; material: string; campaignId?: string | undefined; createdAt: number;
};
export type Booking = { id: string; quoteId: string; leadId: string; createdAt: number; start: string; end: string };
export type Campaign = { id: string; woId: string; bookingId: string; certifiedAt: number; certifiedBy: string };
export type Escrow = {
  id: string; campaignId: string; woId: string; vendorId: string; clientAmount: number; payout: number;
  status: "checker_pending" | "released" | "held"; makerBy: string; makerAt: number; checkerBy?: string | undefined; checkerAt?: number | undefined; utr?: string | undefined; note?: string | undefined;
};
export type Activity = { t: number; who: string; text: string; ref: string };

export type State = {
  role: Role; env: "production" | "staging";
  vendors: Vendor[]; sites: Site[]; leads: Lead[]; quotes: Quote[]; bookings: Booking[]; workOrders: WorkOrder[];
  campaigns: Campaign[]; escrows: Escrow[]; activity: Activity[]; seq: Record<string, number>; seededAt: number;
};

const H = 3600_000;
const D = 24 * H;

function seed(): State {
  const now = Date.now();
  const vendors: Vendor[] = [
    { id: "V-BM", name: "Bundelkhand Media", owner: "Ram Sewak Sharma", initials: "BM", kyc: "verified", gstin: "09AAKFB4512L1Z3", pan: "AAKFB4512L", city: "Orai" },
    { id: "V-GO", name: "Gwalior Outdoor", owner: "Vikas Tomar", initials: "GO", kyc: "verified", gstin: "23AAGFG7781M1Z8", pan: "AAGFG7781M", city: "Gwalior" },
    { id: "V-MM", name: "Metro Mediaworks", owner: "Sneha Iyer", initials: "MM", kyc: "pending", gstin: "29AAQCM2210P1Z1", pan: "AAQCM2210P", city: "Bengaluru" },
    { id: "V-DS", name: "Deccan Signage", owner: "Imran Qureshi", initials: "DS", kyc: "pending", gstin: "36AAFCD9034K1Z6", pan: "AAFCD9034K", city: "Hyderabad" },
  ];
  const s = (o: Partial<Site> & Pick<Site, "id" | "name" | "city" | "corridor" | "category" | "size" | "sqft" | "monthlyRate" | "lat" | "lng" | "vendorId" | "image">): Site =>
    ({ printRate: 18, mounting: 12000, status: "live", illuminated: true, traffic: "1.2L daily vehicles", ...o });
  const sites: Site[] = [
    s({ id: "ST-101", name: "Bandra Flyover Unipole", city: "Mumbai", corridor: "Mumbai Western Express Hwy", category: "Hoardings/Billboards", size: "40×20 ft", sqft: 800, monthlyRate: 120000, lat: 19.0596, lng: 72.8295, vendorId: "V-BM", image: "tower", traffic: "3.1L daily vehicles" }),
    s({ id: "ST-102", name: "AIIMS Flyover LED", city: "Delhi", corridor: "Delhi AIIMS Flyover", category: "Digital LED Screens", size: "20×10 ft", sqft: 200, monthlyRate: 80000, printRate: 0, mounting: 0, lat: 28.5672, lng: 77.21, vendorId: "V-GO", image: "led", traffic: "2.4L daily vehicles" }),
    s({ id: "ST-103", name: "ORR Bus Shelter Pack (10)", city: "Bengaluru", corridor: "Bengaluru ORR", category: "Bus/Metro Transit", size: "6×4 ft ×10", sqft: 240, monthlyRate: 250000, printRate: 22, mounting: 18000, lat: 12.9352, lng: 77.6245, vendorId: "V-BM", image: "day", traffic: "1.8L daily commuters" }),
    s({ id: "ST-104", name: "Orai Gantry Site", city: "Orai", corridor: "Jhansi–Kanpur NH-27", category: "Gantry", size: "60×10 ft", sqft: 600, monthlyRate: 55000, lat: 25.99, lng: 79.45, vendorId: "V-BM", image: "day", traffic: "60K daily vehicles" }),
    s({ id: "ST-105", name: "Phoolbagh LED", city: "Gwalior", corridor: "Phoolbagh Chowk", category: "Digital LED Screens", size: "16×9 ft", sqft: 144, monthlyRate: 45000, printRate: 0, mounting: 0, lat: 26.2124, lng: 78.1772, vendorId: "V-GO", image: "led", traffic: "85K daily vehicles" }),
    s({ id: "ST-106", name: "Hitech City Hoarding", city: "Hyderabad", corridor: "Hitech City Main Rd", category: "Hoardings/Billboards", size: "30×15 ft", sqft: 450, monthlyRate: 95000, lat: 17.4474, lng: 78.3762, vendorId: "V-GO", image: "night" }),
    s({ id: "ST-107", name: "Anna Salai Gantry", city: "Chennai", corridor: "Anna Salai", category: "Gantry", size: "50×8 ft", sqft: 400, monthlyRate: 70000, lat: 13.0604, lng: 80.2496, vendorId: "V-BM", image: "day" }),
    s({ id: "ST-108", name: "Gwalior Promo Van Fleet (5)", city: "Gwalior", corridor: "City-wide routes", category: "E-Rickshaw/Promo Vans", size: "Both sides 6×3 ft", sqft: 180, monthlyRate: 60000, printRate: 20, mounting: 6000, lat: 26.2183, lng: 78.1828, vendorId: "V-GO", image: "day", illuminated: false, traffic: "Mobile · 80 km/day" }),
    s({ id: "ST-109", name: "Phoenix Mall Atrium Screens", city: "Mumbai", corridor: "Lower Parel", category: "Retail Indoor", size: "4 screens 55\"", sqft: 40, monthlyRate: 65000, printRate: 0, mounting: 0, lat: 18.9937, lng: 72.8262, vendorId: "V-BM", image: "led", traffic: "45K weekend footfall" }),
    s({ id: "ST-110", name: "Connaught Place Unipole", city: "Delhi", corridor: "Outer Circle, CP", category: "Hoardings/Billboards", size: "40×20 ft", sqft: 800, monthlyRate: 150000, lat: 28.6315, lng: 77.2167, vendorId: "V-GO", image: "night" }),
  ];
  const leads: Lead[] = [
    { id: "LD-2026-0891", client: "Tata Capital", contact: "Ananya D.", phone: "+91 98200 41872", email: "ananya.d@tatacapital.example", city: "Mumbai", corridor: "Mumbai WEH", media: "Unipole 40×20", siteId: "ST-101", budget: 185000, durationDays: 30, startDate: "2026-11-20", createdAt: now - 75 * 60000, slaMins: 120, status: "new", quoteId: "QT-0891-A", source: "marketplace" },
    { id: "LD-2026-0890", client: "Apex Healthcare", contact: "Dr. Kavita Rao", phone: "+91 98110 22345", email: "kavita@apexhealth.example", city: "Delhi", corridor: "Delhi AIIMS Flyover", media: "Digital LED", siteId: "ST-102", budget: 95000, durationDays: 30, startDate: "2026-11-25", createdAt: now - 50 * 60000, slaMins: 180, status: "new", source: "marketplace" },
    { id: "LD-2026-0888", client: "Allen Coaching", contact: "Rohit Malhotra", phone: "+91 99000 11223", email: "rohit@allen.example", city: "Bengaluru", corridor: "Bengaluru ORR", media: "10 Bus Shelters", siteId: "ST-103", budget: 320000, durationDays: 30, startDate: "2026-11-22", createdAt: now - 20 * H, slaMins: 120, status: "quoted", quoteId: "QT-0888-A", source: "partner", partner: true },
    { id: "LD-2026-0885", client: "Tata Capital", contact: "Ananya D.", phone: "+91 98200 41872", email: "ananya.d@tatacapital.example", city: "Mumbai", corridor: "Mumbai WEH", media: "Unipole 40×20", siteId: "ST-101", budget: 180000, durationDays: 30, startDate: "2026-11-15", createdAt: now - 5 * D, slaMins: 120, status: "approved", quoteId: "QT-0885-A", source: "marketplace" },
    { id: "LD-2026-0884", client: "Apex Healthcare", contact: "Dr. Kavita Rao", phone: "+91 98110 22345", email: "kavita@apexhealth.example", city: "Gwalior", corridor: "Phoolbagh Chowk", media: "Digital LED", siteId: "ST-105", budget: 60000, durationDays: 30, startDate: "2026-11-12", createdAt: now - 8 * D, slaMins: 120, status: "approved", quoteId: "QT-0884-A", source: "marketplace" },
    { id: "LD-2026-0882", client: "Tata Capital", contact: "Ananya D.", phone: "+91 98200 41872", email: "ananya.d@tatacapital.example", city: "Orai", corridor: "Jhansi–Kanpur NH-27", media: "Gantry 60×10", siteId: "ST-104", budget: 90000, durationDays: 30, startDate: "2026-11-16", createdAt: now - 4 * D, slaMins: 120, status: "approved", quoteId: "QT-0882-A", source: "admin" },
    { id: "LD-2026-0886", client: "Tata Capital", contact: "Ananya D.", phone: "+91 98200 41872", email: "ananya.d@tatacapital.example", city: "Hyderabad", corridor: "Hitech City Main Rd", media: "Hoarding 30×15", siteId: "ST-106", budget: 140000, durationDays: 30, startDate: "2026-11-24", createdAt: now - 10 * H, slaMins: 120, status: "quoted", quoteId: "QT-0886-A", source: "marketplace" },
  ];
  const q = (o: Omit<Quote, "version" | "holdEnabled"> & Partial<Quote>): Quote => ({ version: 1, holdEnabled: true, ...o });
  const quotes: Quote[] = [
    q({ id: "QT-0891-A", leadId: "LD-2026-0891", siteId: "ST-101", vendorId: "V-BM", base: 120000, print: 14400, mounting: 12000, payout: 110000, status: "draft" }),
    q({ id: "QT-0888-A", leadId: "LD-2026-0888", siteId: "ST-103", vendorId: "V-BM", base: 250000, print: 5280, mounting: 18000, payout: 215000, status: "sent", sentAt: now - 6 * H, holdUntil: holdUntil(now - 6 * H) }),
    q({ id: "QT-0886-A", leadId: "LD-2026-0886", siteId: "ST-106", vendorId: "V-GO", base: 95000, print: 8100, mounting: 12000, payout: 82000, status: "sent", sentAt: now - 9 * H, holdUntil: holdUntil(now - 9 * H) }),
    q({ id: "QT-0885-A", leadId: "LD-2026-0885", siteId: "ST-101", vendorId: "V-BM", base: 120000, print: 14400, mounting: 12000, payout: 110000, status: "approved", sentAt: now - 5 * D }),
    q({ id: "QT-0884-A", leadId: "LD-2026-0884", siteId: "ST-105", vendorId: "V-GO", base: 45000, print: 0, mounting: 0, payout: 39000, status: "approved", sentAt: now - 8 * D }),
    q({ id: "QT-0882-A", leadId: "LD-2026-0882", siteId: "ST-104", vendorId: "V-BM", base: 55000, print: 10800, mounting: 12000, payout: 52000, status: "approved", sentAt: now - 4 * D }),
  ];
  sites[2]!.holdUntil = quotes[1]!.holdUntil; sites[2]!.holdQuoteId = "QT-0888-A";
  sites[5]!.holdUntil = quotes[2]!.holdUntil; sites[5]!.holdQuoteId = "QT-0886-A";
  const bookings: Booking[] = [
    { id: "BK-5120", quoteId: "QT-0885-A", leadId: "LD-2026-0885", createdAt: now - 4 * D, start: "2026-11-15", end: "2026-12-14" },
    { id: "BK-5114", quoteId: "QT-0884-A", leadId: "LD-2026-0884", createdAt: now - 7 * D, start: "2026-11-12", end: "2026-12-11" },
    { id: "BK-5117", quoteId: "QT-0882-A", leadId: "LD-2026-0882", createdAt: now - 3 * D, start: "2026-11-16", end: "2026-12-15" },
  ];
  const workOrders: WorkOrder[] = [
    { id: "WO-9042", bookingId: "BK-5120", leadId: "LD-2026-0885", quoteId: "QT-0885-A", siteId: "ST-101", vendorId: "V-BM", deadline: now + 3 * H, status: "proof_submitted", installer: "Raju Kumar", material: "Star Flex 340 GSM", createdAt: now - 4 * D,
      day: { image: "seed:day", ts: now - 6 * H, lat: 19.0597, lng: 72.8297, distance: 22 }, night: { image: "seed:night", ts: now - 1 * H, lat: 19.0598, lng: 72.8294, distance: 25 } },
    { id: "WO-9038", bookingId: "BK-5114", leadId: "LD-2026-0884", quoteId: "QT-0884-A", siteId: "ST-105", vendorId: "V-GO", deadline: now - 5 * D, status: "certified", installer: "Sunil Yadav", material: "Digital creative (MP4)", createdAt: now - 7 * D, campaignId: "CMP-3007",
      day: { image: "seed:led", ts: now - 6 * D, lat: 26.2125, lng: 78.1774, distance: 21 }, night: { image: "seed:led", ts: now - 6 * D + 7 * H, lat: 26.2123, lng: 78.177, distance: 34 } },
    { id: "WO-9040", bookingId: "BK-5117", leadId: "LD-2026-0882", quoteId: "QT-0882-A", siteId: "ST-104", vendorId: "V-BM", deadline: now + 26 * H, status: "assigned", installer: "Raju Kumar", material: "Star Flex 340 GSM", createdAt: now - 3 * D },
  ];
  sites[4]!.bookedUntil = now + 24 * D; sites[3]!.bookedUntil = now + 28 * D;
  const campaigns: Campaign[] = [{ id: "CMP-3007", woId: "WO-9038", bookingId: "BK-5114", certifiedAt: now - 5 * D, certifiedBy: "RK (Admin)" }];
  const t = computeQuote(quotes[4]!).total;
  const escrows: Escrow[] = [{ id: "ESC-7701", campaignId: "CMP-3007", woId: "WO-9038", vendorId: "V-GO", clientAmount: t, payout: 39000, status: "checker_pending", makerBy: "RK (Admin)", makerAt: now - 5 * D }];
  return {
    role: "admin", env: "staging", vendors, sites, leads, quotes, bookings, workOrders, campaigns, escrows,
    activity: [{ t: now - 5 * D, who: "RK (Admin)", text: "Certified Day/Night proof, escrow sent to checker", ref: "WO-9038" }],
    seq: { LD: 891, QT: 891, BK: 5120, WO: 9042, CMP: 3007, ESC: 7701, ST: 110 }, seededAt: now,
  };
}

const KEY = "oohrena-state-v2";
let state: State = seed();
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw);
  } catch { /* ignore */ }
}
function set(fn: (s: State) => void) {
  load();
  const next = structuredClone(state);
  fn(next);
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota */ }
  subs.forEach((f) => f());
}
export function getState() { load(); return state; }
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => sel(getState()), () => sel(state));
}
function nextId(s: State, k: string) { const n = (s.seq[k] ?? 0) + 1; s.seq[k] = n; return n; }
function who(s: State) { const r = ROLES.find((r) => r.id === s.role)!; return `${r.initials} (${r.label})`; }
function log(s: State, text: string, ref: string) { s.activity.unshift({ t: Date.now(), who: who(s), text, ref }); }

export const currentVendorId = (r: Role) => (r === "vendor-bm" ? "V-BM" : r === "vendor-go" ? "V-GO" : undefined);
export const quoteTotal = (q: Quote) => computeQuote(q).total;
export function quoteStatus(q: Quote, now = Date.now()): QuoteStatus {
  if (q.status === "sent" && q.holdUntil && !isHoldActive(q.holdUntil, now)) return "expired";
  return q.status;
}

export const actions = {
  setRole: (role: Role) => set((s) => { s.role = role; }),
  setEnv: (env: State["env"]) => set((s) => { s.env = env; }),
  reset: () => { state = seed(); set(() => {}); },
  requestQuote(input: Omit<Lead, "id" | "createdAt" | "slaMins" | "status" | "quoteId">) {
    let id = "";
    set((s) => {
      id = `LD-2026-${String(nextId(s, "LD")).padStart(4, "0")}`;
      s.leads.unshift({ ...input, id, createdAt: Date.now(), slaMins: 120, status: "new" });
      log(s, `New inquiry from ${input.client}`, id);
    });
    return id;
  },
  /** Ensure a draft quote exists for a lead; returns quote id */
  ensureDraft(leadId: string) {
    const st = getState();
    const lead = st.leads.find((l) => l.id === leadId)!;
    const existing = lead.quoteId && st.quotes.find((q) => q.id === lead.quoteId);
    if (existing && (existing.status === "draft" || existing.status === "sent")) return existing.id;
    let qid = "";
    set((s) => {
      const l = s.leads.find((x) => x.id === leadId)!;
      const prev = l.quoteId ? s.quotes.find((q) => q.id === l.quoteId) : undefined;
      const site = s.sites.find((x) => x.id === (prev?.siteId ?? l.siteId)) ?? s.sites.find((x) => x.city === l.city) ?? s.sites[0]!;
      const num = l.id.slice(-4);
      const version = (prev?.version ?? 0) + 1;
      qid = `QT-${num}-${String.fromCharCode(64 + version)}`;
      const months = l.durationDays / 30;
      const base = prev?.base ?? Math.round(site.monthlyRate * months);
      s.quotes.push({
        id: qid, leadId, siteId: site.id, vendorId: prev?.vendorId ?? site.vendorId, base, print: prev?.print ?? site.sqft * site.printRate,
        mounting: prev?.mounting ?? site.mounting, payout: prev?.payout ?? Math.round(base * 0.9), status: "draft", holdEnabled: true, version,
      });
      l.quoteId = qid;
    });
    return qid;
  },
  updateQuote: (id: string, patch: Partial<Quote>) => set((s) => {
    const q = s.quotes.find((x) => x.id === id)!;
    Object.assign(q, patch);
    if (patch.siteId) {
      const site = s.sites.find((x) => x.id === patch.siteId)!;
      q.vendorId = site.vendorId; q.print = site.sqft * site.printRate; q.mounting = site.mounting;
    }
  }),
  saveDraft: (id: string) => set((s) => log(s, "Saved draft quotation", id)),
  /** returns error string or null */
  releaseQuote(id: string): string | null {
    const s0 = getState();
    const q0 = s0.quotes.find((x) => x.id === id)!;
    const site0 = s0.sites.find((x) => x.id === q0.siteId)!;
    const v = s0.vendors.find((x) => x.id === q0.vendorId)!;
    if (v.kyc !== "verified") return `${v.name} KYC is not verified yet`;
    if (isHoldActive(site0.holdUntil) && site0.holdQuoteId !== id) return `${site0.name} is already on 48h hold for ${site0.holdQuoteId}`;
    if (site0.bookedUntil && site0.bookedUntil > Date.now()) return `${site0.name} is booked until ${new Date(site0.bookedUntil).toLocaleDateString("en-IN")}`;
    set((s) => {
      const q = s.quotes.find((x) => x.id === id)!;
      const now = Date.now();
      q.status = "sent"; q.sentAt = now;
      q.holdUntil = q.holdEnabled ? holdUntil(now) : undefined;
      if (q.holdEnabled) { const site = s.sites.find((x) => x.id === q.siteId)!; site.holdUntil = q.holdUntil; site.holdQuoteId = q.id; }
      const l = s.leads.find((x) => x.id === q.leadId)!; l.status = "quoted";
      log(s, q.holdEnabled ? "Released 18% GST quotation · site locked 48h" : "Released 18% GST quotation", q.id);
    });
    return null;
  },
  clientApprove(id: string) {
    set((s) => {
      const q = s.quotes.find((x) => x.id === id)!;
      const now = Date.now();
      q.status = "approved";
      const l = s.leads.find((x) => x.id === q.leadId)!; l.status = "approved";
      const bk = `BK-${nextId(s, "BK")}`; const wo = `WO-${nextId(s, "WO")}`;
      const end = new Date(new Date(l.startDate).getTime() + (l.durationDays - 1) * D).toISOString().slice(0, 10);
      s.bookings.push({ id: bk, quoteId: id, leadId: l.id, createdAt: now, start: l.startDate, end });
      s.workOrders.unshift({ id: wo, bookingId: bk, leadId: l.id, quoteId: id, siteId: q.siteId, vendorId: q.vendorId, deadline: now + 48 * H, status: "assigned", installer: "", material: "Star Flex 340 GSM", createdAt: now });
      const site = s.sites.find((x) => x.id === q.siteId)!;
      site.holdUntil = undefined; site.holdQuoteId = undefined; site.bookedUntil = now + l.durationDays * D;
      log(s, `Client approved quotation → ${bk} / ${wo}`, id);
    });
  },
  clientReject: (id: string, note: string) => set((s) => {
    const q = s.quotes.find((x) => x.id === id)!; q.status = "rejected"; q.clientNote = note;
    s.leads.find((x) => x.id === q.leadId)!.status = "rejected";
    const site = s.sites.find((x) => x.id === q.siteId)!; if (site.holdQuoteId === id) { site.holdUntil = undefined; site.holdQuoteId = undefined; }
    log(s, "Client rejected quotation", id);
  }),
  clientRevision: (id: string, note: string) => set((s) => {
    const q = s.quotes.find((x) => x.id === id)!; q.status = "revision"; q.clientNote = note;
    const l = s.leads.find((x) => x.id === q.leadId)!; l.status = "revision"; l.createdAt = Date.now(); l.note = note;
    log(s, "Client requested revision", id);
  }),
  vendorUpdateWO: (id: string, patch: Partial<WorkOrder>) => set((s) => { Object.assign(s.workOrders.find((w) => w.id === id)!, patch); }),
  submitProof(id: string, kind: "day" | "night", image: string, pos: { lat: number; lng: number }) {
    set((s) => {
      const w = s.workOrders.find((x) => x.id === id)!;
      const site = s.sites.find((x) => x.id === w.siteId)!;
      w[kind] = { image, ts: Date.now(), ...pos, distance: distanceM(pos, site) };
      if (w.status === "rejected" || w.status === "assigned") w.status = "mounted";
      if (w.day && w.night) w.status = "proof_submitted";
      log(s, `Uploaded ${kind} proof`, id);
    });
  },
  certify(id: string) {
    set((s) => {
      const w = s.workOrders.find((x) => x.id === id)!;
      const q = s.quotes.find((x) => x.id === w.quoteId)!;
      const cmp = `CMP-${nextId(s, "CMP")}`; const esc = `ESC-${nextId(s, "ESC")}`;
      w.status = "certified"; w.campaignId = cmp;
      s.campaigns.push({ id: cmp, woId: id, bookingId: w.bookingId, certifiedAt: Date.now(), certifiedBy: who(s) });
      s.escrows.unshift({ id: esc, campaignId: cmp, woId: id, vendorId: w.vendorId, clientAmount: quoteTotal(q), payout: q.payout, status: "checker_pending", makerBy: who(s), makerAt: Date.now() });
      log(s, `Certified proof → ${cmp}, escrow ${esc} awaiting checker`, id);
    });
  },
  rejectProof: (id: string, reason: string) => set((s) => {
    const w = s.workOrders.find((x) => x.id === id)!; w.status = "rejected"; w.rejectReason = reason; w.day = undefined; w.night = undefined;
    log(s, `Rejected proof: ${reason}`, id);
  }),
  checkerRelease: (id: string, utr: string) => set((s) => {
    const e = s.escrows.find((x) => x.id === id)!; e.status = "released"; e.checkerBy = who(s); e.checkerAt = Date.now(); e.utr = utr;
    log(s, `Checker released escrow to vendor (UTR ${utr})`, id);
  }),
  checkerHold: (id: string, note: string) => set((s) => {
    const e = s.escrows.find((x) => x.id === id)!; e.status = "held"; e.note = note; log(s, `Checker put escrow on hold: ${note}`, id);
  }),
  addSite(input: Omit<Site, "id" | "status">) {
    set((s) => { const id = `ST-${nextId(s, "ST")}`; s.sites.push({ ...input, id, status: "pending" }); log(s, `Submitted media asset ${input.name} for review`, id); });
  },
  reviewSite: (id: string, ok: boolean) => set((s) => { s.sites.find((x) => x.id === id)!.status = ok ? "live" : "rejected"; log(s, ok ? "Approved media asset" : "Rejected media asset", id); }),
  reviewVendor: (id: string, ok: boolean) => set((s) => { s.vendors.find((x) => x.id === id)!.kyc = ok ? "verified" : "rejected"; log(s, ok ? "Verified vendor KYC" : "Rejected vendor KYC", id); }),
};
