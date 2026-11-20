/**
 * Seeds comprehensive staging data covering acceptance tests T-01 through T-14.
 * Never runnable against production (checks NODE_ENV !== "production").
 */
import { password as passwordPolicy } from "@oohrena/shared";
import { loadConfig } from "../src/config.js";
import { connectDb, disconnectDb } from "../src/db.js";
import { seedTestAccounts, TEST_ACCOUNTS } from "../src/seed-accounts.js";
import { User, Vendor, Client } from "../src/models/foundation.js";
import { Inventory } from "../src/models/inventory.js";
import { Lead } from "../src/models/lead.js";
import { Quote, Booking, WorkOrder } from "../src/models/booking.js";
import { Campaign } from "../src/models/execution.js";
import { Invoice, Payment, VendorPayable } from "../src/models/finance.js";
import { nextId } from "../src/lib/ids.js";

const cfg = loadConfig();
if (cfg.NODE_ENV === "production") {
  console.error("FATAL: Refusing to seed staging data into production environment.");
  process.exit(1);
}

const pw = passwordPolicy.safeParse(process.env.SEED_PASSWORD ?? "");
if (!pw.success) {
  throw new Error("Set SEED_PASSWORD in apps/api/.env (10+ chars, upper, lower, digit, symbol)");
}

await connectDb(cfg.MONGODB_URI);
console.log("Connected to DB. Starting staging dataset seed...");

// 1. Seed accounts (T-01, T-13)
await seedTestAccounts(cfg, pw.data);

const vendorA = await Vendor.findOne({ pan: "ABCDE1001F" });
const clientA = await User.findOne({ email: "client@test.oohrena.local" });
const admin = await User.findOne({ role: "admin" });
const finance = await User.findOne({ email: "finance@test.oohrena.local" });

if (!vendorA || !clientA || !admin || !finance) {
  throw new Error("Test accounts missing after initial seed");
}

// 2. Seed approved inventory (T-02, T-03, T-04, T-05)
const listings = [
  {
    _id: "INV-HRD-000001",
    vendorId: vendorA._id,
    category: "hoarding",
    title: "Prime Western Express Highway Gantry Hoarding",
    description: "High-visibility gantry hoarding facing Southbound traffic towards Bandra.",
    city: "Mumbai",
    locality: "Bandra East",
    landmark: "Kalanagar Junction",
    address: "WEH, Bandra East, Mumbai",
    pin: "400051",
    location: { type: "Point", coordinates: [72.8515, 19.0596] },
    rate: 250000,
    pricingUnit: "per_month",
    quantity: 1,
    attributes: { widthFt: 60, heightFt: 20, illuminated: true, facing: "Southbound" },
    status: "approved",
    dataType: "VERIFIED",
    approvedBy: admin._id,
    approvedAt: new Date(),
    createdBy: vendorA.userId,
  },
  {
    _id: "INV-LED-000001",
    vendorId: vendorA._id,
    category: "led_screen",
    title: "Cyber City Cyber Hub Mega Digital Display",
    description: "Premium digital LED screen with high dwell time in business hub.",
    city: "Gurugram",
    locality: "Cyber City",
    landmark: "DLF Cyber Hub Gate 2",
    address: "DLF Cyber City, Gurugram",
    pin: "122002",
    location: { type: "Point", coordinates: [77.0888, 28.4950] },
    rate: 15000,
    pricingUnit: "per_day",
    quantity: 10,
    attributes: { widthFt: 40, heightFt: 25, slotLengthSec: 10, loopLengthSec: 120 },
    status: "approved",
    dataType: "VERIFIED",
    approvedBy: admin._id,
    approvedAt: new Date(),
    createdBy: vendorA.userId,
  },
  {
    _id: "INV-UNP-000001",
    vendorId: vendorA._id,
    category: "unipole",
    title: "MG Road Metro Station Unipole",
    description: "Unipole right at high footfall metro entrance.",
    city: "Bengaluru",
    locality: "MG Road",
    landmark: "Metro Station Exit A",
    address: "MG Road, Bengaluru",
    pin: "560001",
    location: { type: "Point", coordinates: [77.6074, 12.9756] },
    rate: 180000,
    pricingUnit: "per_month",
    quantity: 1,
    attributes: { widthFt: 30, heightFt: 15, illuminated: true },
    status: "approved",
    dataType: "VERIFIED",
    approvedBy: admin._id,
    approvedAt: new Date(),
    createdBy: vendorA.userId,
  },
];

for (const item of listings) {
  await Inventory.findByIdAndUpdate(item._id, item, { upsert: true });
}
console.log(`Seeded ${listings.length} approved verified inventory listings.`);

// 3. Seed an active booking with Work Order and Campaign (T-06, T-08, T-09, T-10, T-11, T-12)
const leadId = "LD-2026-000001";
await Lead.findByIdAndUpdate(
  leadId,
  {
    _id: leadId,
    clientId: clientA.orgId,
    createdBy: clientA._id,
    source: "web",
    status: "won",
    city: "Mumbai",
    from: "2026-12-01",
    to: "2026-12-31",
    requirement: "Grand product launch campaign across Bandra Highway gantry",
    inventoryIds: ["INV-HRD-000001"],
  },
  { upsert: true },
);

const quoteId = "QT-2026-000001-V1";
await Quote.findByIdAndUpdate(
  quoteId,
  {
    _id: quoteId,
    leadId,
    version: 1,
    clientId: clientA.orgId,
    status: "approved",
    validUntil: "2026-12-15",
    items: [
      {
        inventoryId: "INV-HRD-000001",
        vendorId: vendorA._id,
        category: "hoarding",
        title: "Prime Western Express Highway Gantry Hoarding",
        from: "2026-12-01",
        to: "2026-12-31",
        qty: 1,
        rate: 250000,
        billableUnits: 1,
        production: 20000,
        installation: 15000,
        vendorCost: 200000,
        lineSubtotal: 285000,
      },
    ],
    totals: {
      subtotal: 285000,
      serviceFeePct: 10,
      serviceFee: 28500,
      gstPct: 18,
      gst: 56430,
      grandTotal: 369930,
      vendorCostTotal: 200000,
    },
    createdBy: admin._id,
    releasedBy: admin._id,
    releasedAt: new Date(),
    approvedAt: new Date(),
  },
  { upsert: true },
);

const bookingId = "BK-2026-000001";
await Booking.findByIdAndUpdate(
  bookingId,
  {
    _id: bookingId,
    quoteId,
    leadId,
    clientId: clientA.orgId,
    status: "in_progress",
    from: "2026-12-01",
    to: "2026-12-31",
    items: [
      {
        inventoryId: "INV-HRD-000001",
        vendorId: vendorA._id,
        from: "2026-12-01",
        to: "2026-12-31",
        qty: 1,
        rate: 250000,
        production: 20000,
        installation: 15000,
        vendorCost: 200000,
      },
    ],
    totals: {
      subtotal: 285000,
      serviceFee: 28500,
      gst: 56430,
      grandTotal: 369930,
      vendorCostTotal: 200000,
    },
    createdBy: admin._id,
  },
  { upsert: true },
);

const woId = "WO-2026-000001";
await WorkOrder.findByIdAndUpdate(
  woId,
  {
    _id: woId,
    bookingId,
    vendorId: vendorA._id,
    status: "in_progress",
    items: [
      {
        inventoryId: "INV-HRD-000001",
        from: "2026-12-01",
        to: "2026-12-31",
        qty: 1,
        vendorCost: 200000,
      },
    ],
    instructions: "Mount flex with high-resolution UV print; illuminate between 6 PM to 12 AM.",
    createdBy: admin._id,
  },
  { upsert: true },
);

const campaignId = "CMP-2026-000001";
await Campaign.findByIdAndUpdate(
  campaignId,
  {
    _id: campaignId,
    bookingId,
    clientId: clientA.orgId,
    name: "Bandra Highway Launch Campaign",
    status: "running",
    from: "2026-12-01",
    to: "2026-12-31",
    sitesCount: 1,
  },
  { upsert: true },
);

// 4. Seed Invoice and Verified Payment
const invId = "TXI-2026-000001";
await Invoice.findByIdAndUpdate(
  invId,
  {
    _id: invId,
    bookingId,
    clientId: clientA.orgId,
    status: "partially_paid",
    sacCode: "998361",
    subtotal: 285000 + 28500,
    cgst: 28215,
    sgst: 28215,
    igst: 0,
    total: 369930,
    advanceDue: 184965,
    dueDate: "2026-12-08",
    issuedAt: new Date(),
  },
  { upsert: true },
);

const payId = "PAY-2026-000001";
await Payment.findByIdAndUpdate(
  payId,
  {
    _id: payId,
    bookingId,
    direction: "client_receipt",
    amount: 184965,
    mode: "neft",
    reference: "HDFCN261201009988",
    status: "verified",
    recordedBy: admin._id,
    verifiedBy: finance._id,
    verifiedAt: new Date(),
    paidOn: "2026-12-02",
  },
  { upsert: true },
);

console.log("Staging dataset successfully seeded for acceptance tests T-01 through T-14!");
await disconnectDb();
