// Run once per environment with mongosh as a DB admin:
//   mongosh "<admin connection string>" --file apps/api/scripts/mongo-app-role.js
// Creates the role the API's DB user should have: full CRUD on app collections,
// but insert + find ONLY on audit_logs, so the audit trail is append-only at the database level.
// On Atlas, create the equivalent "Custom Role" in Database Access instead (same privileges).

const dbName = "oohrena";
const target = db.getSiblingDB(dbName);
const crud = ["find", "insert", "update", "remove", "createIndex", "dropIndex", "listIndexes", "createCollection", "collStats"];
const appCollections = [
  "users",
  "sessions",
  "clients",
  "vendors",
  "growth_partners",
  "consents",
  "system_events",
  "counters",
  "campaigns",
  "proof_schedule",
  "proofs",
  "execution_updates",
  "issues",
  "invoices",
  "credit_notes",
  "payments",
  "payment_history",
  "vendor_payables",
  "quotes",
  "bookings",
  "booking_history",
  "work_orders",
  "lead_assignments",
  "overrides",
  "leads",
  "shortlists",
  "availability",
  "availability_requests",
  "inventory",
  "inventory_history",
  "duplicate_flags",
  "files",
  "vendor_documents",
  "vendor_bank",
  "report_exports",
  "notifications",
  "notification_templates",
  "user_tokens",
  "two_factor_challenges",
  "system_settings",
  "system_setting_history",
  "vendor_users",
];

target.createRole({
  role: "oohrenaApp",
  privileges: [
    ...appCollections.map((c) => ({ resource: { db: dbName, collection: c }, actions: crud })),
    { resource: { db: dbName, collection: "audit_logs" }, actions: ["find", "insert", "createIndex", "listIndexes", "createCollection"] },
    { resource: { db: dbName, collection: "" }, actions: ["listCollections"] },
  ],
  roles: [],
});
print("Role oohrenaApp created. Add new module collections to appCollections as they are introduced.");
