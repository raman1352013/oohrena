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
];
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const file = (buf: Buffer, type: string) => new Blob([new Uint8Array(buf)], { type });

const LISTINGS = [
  { title: "Phoolbagh Chowk Front-lit Hoarding", city: "Gwalior", locality: "Phoolbagh", landmark: "Near Phoolbagh Chowk", address: "Phoolbagh Road", pin: "474001", lat: 26.2124, lng: 78.1772, rate: 45000, w: 40, h: 20, price: 52000 },
  { title: "Western Express Highway Gantry", city: "Mumbai", locality: "Bandra East", landmark: "Kalanagar Junction", address: "WEH, Bandra East", pin: "400051", lat: 19.0596, lng: 72.8515, rate: 250000, w: 60, h: 20, price: 285000 },
  { title: "Cyber Hub Entry Hoarding", city: "Gurugram", locality: "DLF Cyber City", landmark: "Cyber Hub Gate 2", address: "DLF Phase 2", pin: "122002", lat: 28.4951, lng: 77.0886, rate: 180000, w: 40, h: 20, price: 210000 },
  { title: "MG Road Metro Station Hoarding", city: "Bengaluru", locality: "MG Road", landmark: "MG Road Metro Exit A", address: "Mahatma Gandhi Road", pin: "560001", lat: 12.9756, lng: 77.6068, rate: 150000, w: 30, h: 15, price: 172000 },
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
      category: "hoarding", title: l.title, city: l.city, locality: l.locality, landmark: l.landmark, address: l.address, pin: l.pin,
      lat: l.lat, lng: l.lng, rate: l.rate, pricingUnit: "per_month", quantity: 1, attributes: { widthFt: l.w, heightFt: l.h },
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

  log("\nDemo data ready. Sign in at the web app with the seeded accounts.");
}
