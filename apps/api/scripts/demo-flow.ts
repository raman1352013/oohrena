/**
 * The demo chain, driven only through the public HTTP API so every record gets the same validation,
 * maths, IDs, transitions and audit as real use. Shared by seed-demo.ts (against a running API) and
 * seed-staging.ts (against an in-process API on the target database). Needs the seeded test accounts.
 */
import { deflateSync } from "node:zlib";

type Json = Record<string, any>;

async function call(API: string, token: string | null, method: string, path: string, body?: Json | FormData): Promise<Json> {
  const headers: Record<string, string> = { "x-auth-mode": "token" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(API + path, { method, headers, body: payload });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return json.data ?? json;
}

async function login(API: string, PW: string, email: string) {
  const d = await call(API, null, "POST", "/auth/login", { email, password: PW });
  if (!d.token) throw new Error(`Login for ${email} did not return a token (2FA on?): ${JSON.stringify(d).slice(0, 200)}`);
  return d.token as string;
}

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
// ---- Placeholder site photo: an illustrated hoarding at dusk, drawn as a PNG (no image library). ----
type RGB = [number, number, number];
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as RGB;

function sitePhoto(sky: RGB, face: RGB, accent: RGB): Buffer {
  const W = 960, H = 540;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  const horizon = 400;
  const bx0 = 200, bx1 = 760, by0 = 90, by1 = 300; // billboard face
  for (let y = 0; y < H; y++) {
    const row = y * (W * 3 + 1);
    for (let x = 0; x < W; x++) {
      let p: RGB;
      if (y >= horizon) p = mix([52, 56, 64], [28, 30, 36], (y - horizon) / (H - horizon)); // road
      else p = mix(sky, [250, 214, 165], y / horizon); // sky → warm horizon
      const inFrame = x >= bx0 - 10 && x < bx1 + 10 && y >= by0 - 10 && y < by1 + 10;
      const inFace = x >= bx0 && x < bx1 && y >= by0 && y < by1;
      const post = y >= by1 + 10 && y < horizon + 20 && ((x >= 330 && x < 350) || (x >= 610 && x < 630));
      if (post) p = [70, 74, 82];
      if (inFrame) p = [236, 238, 242];
      if (inFace) {
        p = mix(face, mix(face, [0, 0, 0], 0.35), (y - by0) / (by1 - by0));
        if ((x - bx0 + (y - by0)) % 140 < 40) p = mix(p, accent, 0.55); // diagonal ad stripes
        if (y > by1 - 46 && y < by1 - 24 && x > bx0 + 30 && x < bx0 + 300) p = [255, 255, 255]; // "headline" bar
      }
      if (y >= 470 && y < 478 && x % 90 < 50) p = [230, 200, 90]; // lane markings
      raw[row + 1 + x * 3] = p[0];
      raw[row + 2 + x * 3] = p[1];
      raw[row + 3 + x * 3] = p[2];
    }
  }
  // One random pixel keeps every upload unique for the duplicate-photo check.
  raw[raw.length - 3] = Math.floor(Math.random() * 256);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PALETTES: [RGB, RGB, RGB][] = [
  [[44, 62, 110], [234, 88, 12], [253, 186, 116]], // Gwalior — brand orange
  [[30, 41, 82], [14, 116, 144], [125, 211, 252]], // Mumbai — teal
  [[59, 47, 99], [124, 58, 237], [196, 181, 253]], // Gurugram — violet
  [[37, 71, 74], [22, 163, 74], [134, 239, 172]], // Bengaluru — green
  [[20, 30, 60], [37, 99, 235], [147, 197, 253]], // Delhi LED — blue
  [[70, 40, 30], [220, 38, 38], [252, 165, 165]], // Indore — red
  [[40, 50, 40], [202, 138, 4], [253, 224, 71]], // Pune bus — amber
  [[50, 30, 60], [219, 39, 119], [249, 168, 212]], // Noida mall — pink
  [[25, 45, 55], [8, 145, 178], [103, 232, 249]], // Lucknow van — cyan
];
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const file = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });

type Listing = { title: string; city: string; locality: string; landmark: string; address: string; pin: string; lat: number; lng: number; rate: number; price: number; category?: string; unit?: string; attrs?: Record<string, string | number | boolean> };
const LISTINGS: Listing[] = [
  { title: "Phoolbagh Chowk Front-lit Hoarding", city: "Gwalior", locality: "Phoolbagh", landmark: "Near Phoolbagh Chowk", address: "Phoolbagh Road", pin: "474001", lat: 26.2124, lng: 78.1772, rate: 45000, price: 52000, attrs: { widthFt: 40, heightFt: 20, illuminated: true } },
  { title: "Western Express Highway Gantry", city: "Mumbai", locality: "Bandra East", landmark: "Kalanagar Junction", address: "WEH, Bandra East", pin: "400051", lat: 19.0596, lng: 72.8515, rate: 250000, price: 285000, attrs: { widthFt: 60, heightFt: 20, illuminated: true } },
  { title: "Cyber Hub Entry Hoarding", city: "Gurugram", locality: "DLF Cyber City", landmark: "Cyber Hub Gate 2", address: "DLF Phase 2", pin: "122002", lat: 28.4951, lng: 77.0886, rate: 180000, price: 210000, attrs: { widthFt: 40, heightFt: 20 } },
  { title: "MG Road Metro Station Hoarding", city: "Bengaluru", locality: "MG Road", landmark: "MG Road Metro Exit A", address: "Mahatma Gandhi Road", pin: "560001", lat: 12.9756, lng: 77.6068, rate: 150000, price: 172000, attrs: { widthFt: 30, heightFt: 15 } },
  // More media types, so the marketplace shows the 360° range.
  { title: "Connaught Place Outer Circle LED Screen", city: "New Delhi", locality: "Connaught Place", landmark: "Block N, Outer Circle", address: "Outer Circle, Connaught Place", pin: "110001", lat: 28.6328, lng: 77.2197, rate: 120000, price: 140000, category: "led_screen", attrs: { widthFt: 20, heightFt: 10, slotLengthSec: 10, loopLengthSec: 120, operatingHours: "7 AM – 11 PM" } },
  { title: "Vijay Nagar Square Unipole", city: "Indore", locality: "Vijay Nagar", landmark: "Vijay Nagar Square", address: "AB Road, Vijay Nagar", pin: "452010", lat: 22.7533, lng: 75.8937, rate: 60000, price: 70000, category: "unipole", attrs: { widthFt: 30, heightFt: 15, illuminated: true } },
  { title: "Pune City Bus Back-Panel Branding (25 buses)", city: "Pune", locality: "Shivajinagar", landmark: "Shivajinagar Bus Depot", address: "Shivajinagar Depot", pin: "411005", lat: 18.5308, lng: 73.8475, rate: 9000, price: 10500, category: "transit", unit: "per_vehicle_month", attrs: { fleetSize: 25, panelSize: "8 ft x 3 ft", routes: "Shivajinagar – Hinjewadi, Swargate – Kharadi" } },
  { title: "Noida Mall Atrium Digital Standees", city: "Noida", locality: "Sector 18", landmark: "Main atrium, ground floor", address: "Sector 18, Noida", pin: "201301", lat: 28.5677, lng: 77.3211, rate: 35000, price: 42000, category: "indoor_retail", attrs: { venueType: "Shopping mall", screenCount: 6, panelSize: "55-inch portrait" } },
  { title: "Lucknow Mobile LED Van", city: "Lucknow", locality: "Hazratganj", landmark: "Hazratganj Crossing", address: "Hazratganj", pin: "226001", lat: 26.8467, lng: 80.9462, rate: 15000, price: 18000, category: "mobile_led_van", unit: "per_day", attrs: { fleetSize: 1, screenSize: "12 ft x 8 ft", routes: "Hazratganj, Gomti Nagar, Aminabad" } },
];

export async function runDemoFlow(apiBase: string, PW: string, log: (msg: string) => void = console.log) {
  const API = apiBase.replace(/\/$/, "") + "/api/v1";
  const admin = await login(API, PW, "admin@test.oohrena.local");
  const vendor = await login(API, PW, "vendor@test.oohrena.local");
  const client = await login(API, PW, "client@test.oohrena.local");
  const finance = await login(API, PW, "finance@test.oohrena.local");
  log("Logged in as admin, vendor A, client A, finance");

  const vendorId = (await call(API, vendor, "GET", "/vendors/me")).vendorId as string;

  const inventory: string[] = [];
  for (const [i, l] of LISTINGS.entries()) {
    const created = await call(API, vendor, "POST", "/vendors/me/inventory", {
      category: l.category ?? "hoarding", title: l.title, city: l.city, locality: l.locality, landmark: l.landmark, address: l.address, pin: l.pin,
      lat: l.lat, lng: l.lng, rate: l.rate, pricingUnit: l.unit ?? "per_month", quantity: 1, attributes: l.attrs ?? {},
    });
    const id = created.inventoryId as string;
    const fd = new FormData();
    const [sky, face, accent] = PALETTES[i % PALETTES.length]!;
    fd.append("photos", file(sitePhoto(sky, face, accent), "image/png"), "site.png");
    await call(API, vendor, "POST", `/vendors/me/inventory/${id}/photos`, fd);
    await call(API, vendor, "POST", `/vendors/me/inventory/${id}/submit`);
    await call(API, admin, "POST", `/admin/inventory/${id}/decision`, { decision: "approve", indicativePrice: l.price });
    await call(API, vendor, "PATCH", `/vendors/me/inventory/${id}/availability-mode`, { mode: "managed" });
    inventory.push(id);
    log(`  listing ${id}  ${l.city} — ${l.title}  (approved, live)`);
  }

  // Full chain on the Gwalior + Mumbai listings.
  const from = day(14);
  const to = day(43);
  const leadId = (await call(API, client, "POST", "/leads", { inventoryIds: [inventory[0], inventory[1]], from, to, requirement: "Festive season launch — two cities, front-lit preferred" })).leadId as string;
  await call(API, admin, "POST", `/admin/leads/${leadId}/status`, { status: "under_review" });
  await call(API, admin, "POST", `/admin/leads/${leadId}/assign`, { vendorId });
  const quote = await call(API, admin, "POST", "/admin/quotes", {
    leadId,
    items: [
      { inventoryId: inventory[0], from, to, production: 8000, installation: 4000 },
      { inventoryId: inventory[1], from, to, production: 30000, installation: 15000 },
    ],
  });
  const quoteId = quote.quoteId as string;
  await call(API, admin, "POST", `/admin/quotes/${quoteId}/approve`);
  await call(API, client, "POST", `/quotes/${quoteId}/decision`, { decision: "approve" });
  const bookingId = (await call(API, admin, "POST", "/admin/bookings", { quoteId })).bookingId as string;
  const wos = (await call(API, admin, "POST", `/admin/bookings/${bookingId}/work-order`, { instructions: "Mount flex with UV print; upload geo-tagged installation proof within 48h." })) as unknown as Json[];
  log(`  lead ${leadId} → quote ${quoteId} (client approved) → booking ${bookingId} → work order ${wos.map((w) => w.workOrderId).join(", ")}`);

  const invoice = await call(API, admin, "POST", "/finance/invoices", { bookingId });
  const advance = Number(invoice.advanceDue ?? invoice.advance ?? 0) || Math.round(Number(invoice.total ?? 0) / 2);
  const pf = new FormData();
  pf.append("bookingId", bookingId);
  pf.append("amount", String(advance));
  pf.append("mode", "neft");
  pf.append("reference", `DEMO${Date.now().toString().slice(-8)}`);
  pf.append("paidOn", day(0));
  pf.append("note", "Advance received (demo)");
  pf.append("file", file(PDF, "application/pdf"), "utr.pdf");
  const payment = await call(API, admin, "POST", "/finance/payments", pf);
  await call(API, finance, "POST", `/finance/payments/${payment.paymentId}/verify`, { decision: "verify" });
  log(`  invoice ${invoice.invoiceId ?? invoice._id} → payment ${payment.paymentId} ₹${advance} (recorded by admin, verified by finance)`);

  // A fresh inquiry so the admin inbox has something to act on during the demo.
  const lead2 = (await call(API, client, "POST", "/leads", { inventoryIds: [inventory[2], inventory[3]], from: day(30), to: day(59), requirement: "Brand awareness in Gurugram + Bengaluru tech corridors" })).leadId as string;
  log(`  lead ${lead2} left as New in the admin inbox`);

  // ---- Extra data so every screen has something real to show ----
  // Execution: vendor acknowledges WO-1 and uploads installation proof for both sites;
  // admin verifies the Gwalior one (client gallery shows it), Mumbai stays in the admin queue.
  const woId = wos[0]!.workOrderId as string;
  await call(API, vendor, "POST", `/work-orders/${woId}/acknowledge`);
  const exec = await call(API, vendor, "GET", `/work-orders/${woId}/execution`);
  const proofIds: string[] = [];
  for (const [i, invId] of [inventory[0]!, inventory[1]!].entries()) {
    const slot = (exec.schedule as Json[]).find((s) => s.inventoryId === invId && s.type === "before");
    const pf2 = new FormData();
    pf2.append("inventoryId", invId);
    if (slot) pf2.append("scheduleId", slot.scheduleId);
    pf2.append("capturedAt", new Date().toISOString());
    pf2.append("lat", String(LISTINGS[i]!.lat + 0.0003));
    pf2.append("lng", String(LISTINGS[i]!.lng + 0.0002));
    pf2.append("accuracyM", "12");
    const [sky, face, accent] = PALETTES[i]!;
    pf2.append("file", file(sitePhoto(sky, face, accent), "image/png"), "installed.png");
    proofIds.push((await call(API, vendor, "POST", `/work-orders/${woId}/proofs`, pf2)).proofId as string);
  }
  await call(API, admin, "POST", `/admin/proofs/${proofIds[0]}/decision`, { decision: "verify" });
  log(`  ${woId} acknowledged; installation proof ${proofIds[0]} verified, ${proofIds[1]} waiting in the admin queue`);

  // Client A billing profile (company details card) and Vendor A payout bank account (shown masked).
  await call(API, client, "PUT", "/clients/me", {
    gstin: "27AABCT1234C1Z5",
    billingAddress: { line1: "4th Floor, Trade Centre", line2: "Bandra Kurla Complex", city: "Mumbai", state: "Maharashtra", pin: "400051" },
    contacts: [{ name: "Priya Sharma", email: "marketing@test.oohrena.local", mobile: "+919800000011", designation: "Marketing Manager" }],
  });
  await call(API, vendor, "PUT", "/vendors/me/bank", { accountName: "Test Vendor A Media", accountNo: "123456789012", ifsc: "HDFC0001234", bankName: "HDFC Bank" });
  log("  client A billing profile and vendor A bank account filled");

  // Vendor B (KYC pending) uploads documents, so the admin KYC review has files to check.
  const vendorB = await login(API, PW, "vendor2@test.oohrena.local");
  for (const type of ["pan", "gst", "address_proof"]) {
    const df = new FormData();
    df.append("type", type);
    df.append("file", file(PDF, "application/pdf"), `${type}.pdf`);
    await call(API, vendorB, "POST", "/vendors/me/documents", df);
  }
  log("  vendor B uploaded PAN, GST and address proof (KYC waiting for admin)");

  // Client B: LED screen inquiry → reviewed, assigned, quote released and waiting for the client's decision.
  const clientB = await login(API, PW, "client2@test.oohrena.local");
  const f3 = day(21), t3 = day(50);
  const lead3 = (await call(API, clientB, "POST", "/leads", { inventoryIds: [inventory[4]], from: f3, to: t3, budget: 150000, requirement: "New store launch — 10-second spot, Connaught Place" })).leadId as string;
  await call(API, admin, "POST", `/admin/leads/${lead3}/status`, { status: "under_review" });
  await call(API, admin, "POST", `/admin/leads/${lead3}/assign`, { vendorId });
  const q3 = (await call(API, admin, "POST", "/admin/quotes", { leadId: lead3, items: [{ inventoryId: inventory[4], from: f3, to: t3, production: 5000, installation: 0 }] })).quoteId as string;
  await call(API, admin, "POST", `/admin/quotes/${q3}/approve`);
  log(`  client B lead ${lead3} → quote ${q3} released, waiting for the client`);

  // Client A: a second inquiry the admin has started reviewing.
  const lead4 = (await call(API, client, "POST", "/leads", { inventoryIds: [inventory[6], inventory[7]], from: day(35), to: day(64), budget: 400000, requirement: "Pune buses + Noida mall screens for a festive sale" })).leadId as string;
  await call(API, admin, "POST", `/admin/leads/${lead4}/status`, { status: "under_review" });
  log(`  lead ${lead4} under review`);

  // Growth partner refers a new advertiser.
  const partner = await login(API, PW, "partner@test.oohrena.local");
  await call(API, partner, "POST", "/partner/leads", { clientName: "Sharma Sweets Pvt Ltd", clientEmail: "owner@sharmasweets.test", clientMobile: "+919800000022", requirement: "Diwali hoardings near 3 outlets", city: "Indore", budget: 120000 });
  log("  growth partner referral created");

  log("\nDemo data ready. Sign in at the web app with the seeded accounts.");
}
