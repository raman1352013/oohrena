# Phase 1 poora karne ka plan (Antigravity ke liye)

Updated: 27 Nov 2026. Ye file **owner ke liye** hai (jo Antigravity chala raha hai).

Source: founder ka **Technology Vision & Development Blueprint** (`docs/DOC-20261126-WA0001.pdf`, Section 3 aur 7)
aur status report "OOHRENA Phase 1 Status Report" (27 Nov). Har task ka tareeka wahi 8 steps hain jo
`docs/ANTIGRAVITY_NEXT_STEPS_HINGLISH.md` §2 mein likhe hain: branch, naya conversation, Planning mode, plan padho,
phone pe screenshot, review checklist, phir merge.

---

## 1. Phase 1 mein kya bacha hai

Founder ke Phase 1 ke 9 mein se 7 kaam ban chuke hain. Baaki kaam ye hain:

| Kami (founder blueprint) | Section | Task |
|---|---|---|
| Territory tree (State → Zone → District → Area) | 3.1, 4.3, 7 | **P1-B** |
| Super Vendor hierarchy ki database foundation | 4, 7 | **P1-C** |
| Site ke ownership / permit documents, validity ke saath | 3.2 | **V1.12** |
| Zaroori photo set + photo location cross-check | 3.2 | **V1.11** |
| Har face ka detail (faces, disha, light), ownership type | 3.2 | **T7** |
| Rate card ke versions, validity ke saath | 3.2 | **V1.18** |
| Maintenance status (chalu / maintenance / kharab) | 3.2 | **P1-A** |
| Review mein "request more information" ka option | 3.2 | **P1-A** |
| Edit ke baad dobara verification ke niyam | 3.3 | **V1.15** |
| Verification rounds, verifier console | 3.2, 7 | **V1.8 + V1.13** |
| Dobara verification ka cycle | 3.3 | **V1.17** |
| Asset ID ka format | 3.2 | **V1.7** |
| Vendor ki inventory screens (sab naye fields ke saath) | 7 | **V1.22** |
| Section 10 ke documents (architecture, ER diagram, workflows…) | 10 | **DOC-1 … DOC-6** |
| Phase 1 mein inquiry/booking screens chhupana (agar founder bole) | 7 | **P1-D** |

---

## 2. Pehle owner ke faisle (kal ki meeting mein)

Ye faisle bina liye kuch tasks shuru nahi ho sakte. Jawab `docs/VENDOR_BLUEPRINT_BUILD_PLAN.md` ki
"Decisions needed" table mein likh do, tab agent padh lega.

| Faisla | Kaun sa task ruka hai |
|---|---|
| **Database: MongoDB hi rahega, ya relational?** Sabse pehle. Relational chuna to naye data models ka plan badlega. | P1-B, P1-C (aur baaki naye models) |
| Territory levels ke naam aur gehrai (State → Zone → District → Area, ya kuch aur) | P1-B |
| Super Vendor kaun banata hai, ek area mein do ho sakte hain? (Q6) | P1-C |
| Asset ID format (D3), jaise `OHR-MP-IND-HO-000124` | V1.7 |
| Inquiry/booking screens Phase 1 mein live site pe chhupani hain? (D6) | P1-D |
| KYC ke zaroori documents ki list | Koi task nahi rukta (setting mein hai), par launch se pehle chahiye |

**Bina faisle ke shuru ho sakte hain:** T7, P1-A, V1.11, V1.12, V1.8 + V1.13, V1.15, V1.16, V1.18, V1.17,
V1.22 aur saare DOC tasks. Jo number abhi tay nahi (photo kitni, cycle kitne din), wo `system_settings` mein
default ke saath jaata hai, taaki owner baad mein bina code ke badal sake.

---

## 3. Order (isi kram mein)

Ek waqt pe **ek code task**. DOC tasks sirf `docs/` mein likhte hain, isliye code task ke saath parallel chal sakte hain.

| # | Task | Branch | Prompt kahan hai | Ruka hai? |
|---|------|--------|------------------|-----------|
| 1 | **T7** Listing fields: faces, disha, light, ownership type, rate mein kya shamil | `feat/onboard-t7-listing-fields` | `docs/WEEKEND_BUILD_PLAYBOOK.md` §4 T7 | Nahi |
| 2 | **P1-A** "Request more info" + maintenance status | `feat/p1a-more-info-maintenance` | Is file ka §5 | Nahi |
| 3 | **V1.11** Evidence photos (photo set, EXIF, doori) | `feat/v1-11-evidence-photos` | §4 (template) + build plan V1.11 | Nahi |
| 4 | **V1.12** Asset documents (permit / NOC / lease, expiry) | `feat/v1-12-asset-documents` | §4 + build plan V1.12 | Nahi |
| 5 | **V1.8 + V1.13** Status lifecycle + verifier console | `feat/v1-13-verifier-console` | §4 + build plan V1.8, V1.13 | Nahi (3 aur 4 ke baad) |
| 6 | **V1.15 + V1.16** Re-review niyam + duplicate 15 m | `feat/v1-15-16-rereview-duplicates` | §4 + build plan | Nahi |
| 7 | **V1.18** Rate card versions | `feat/v1-18-rate-card` | §4 + build plan | Nahi |
| 8 | **V1.17** Re-verification reminders aur expiry | `feat/v1-17-reverification` | §4 + build plan | Nahi (5 ke baad) |
| 9 | **V1.7** Asset code | `feat/v1-7-asset-code` | §4 + build plan | **D3** |
| 10 | **P1-B** Territory tree | `feat/p1b-territory-tree` | §5 | **Database + level ke naam** |
| 11 | **P1-C** Super Vendor data foundation | `feat/p1c-network-foundation` | §5 | **P1-B + Q6** |
| 12 | **V1.22** Vendor inventory screens (sab upar wale fields) | `feat/v1-22-inventory-screens` | §4 + build plan | 1–8 merged |
| 13 | **P1-D** Phase 3 screens chhupane ka switch | `feat/p1d-phase-switch` | §5 | **D6** |
| 14 | Staging deploy + smoke test | — (khud / developer) | `docs/LAUNCH_GUIDE.md` §8 | 1–12 merged |
| — | **DOC-1 … DOC-6** Section 10 ke documents | `docs/section10-<n>` | §6 | Nahi, kabhi bhi |

Founder ke Phase 2 ke kaam (Super Vendor dashboards, reassignment tool, network performance) is plan mein **nahi** hain.

---

## 4. Prompt template: build plan wale tasks (V1.x)

Inka poora spec `docs/VENDOR_BLUEPRINT_BUILD_PLAN.md` mein hai. Antigravity mein ye paste karo, `<V1.x>` badal ke:

```
You are working in the OOHRENA monorepo (npm workspaces: apps/api, apps/web, packages/shared).
Read AGENTS.md completely and follow it exactly; it overrides your defaults.
Then read: docs/VENDOR_BLUEPRINT_BUILD_PLAN.md (the task and its AT-… tests), docs/PHASE1_PLAN_HINGLISH.md,
and Sections 3 and 7 of docs/DOC-20261126-WA0001.pdf (Founder's Blueprint: Phase 1 scope).

Task: build <V1.x> exactly as written in the build plan. Only this task; do not touch files another task owns.
Rules:
- Contracts first in packages/shared (zod schema, enums, transitions), then model, service, route, tests, web.
- Every endpoint: requirePermission + ownership check (another user's record → 404).
- Every status change and decision is audited with a reason where AGENTS.md requires one.
- Any number not fixed by the build plan goes in packages/shared/src/settings.ts with a default, not in code.
- Any business choice the build plan and the Founder's Blueprint leave open: write it as "OWNER:" in your plan and stop.
- Write the AT-… tests plus negatives: wrong role 403, other user's ID 404, bad input 400, invalid transition 409.
- New /vendors/me/... endpoints go inside routes/vendors.ts (router shadowing, AGENTS.md §6).
Before writing code, show me your plan: files you will change, data model changes, endpoints, tests.
Done means: npm test, npm run typecheck and npm run build -w @oohrena/web all pass, and you show the screen at
375px width with a seeded account (README).
```

---

## 5. Naye task (inka prompt kahin aur nahi hai)

Har prompt se pehle §4 ki pehli 4 lines (repo, AGENTS.md, padhne wale docs) paste karo.

### P1-A: "Request more info" + maintenance status

```
Task P1-A. Two small additions from Founder's Blueprint §3.2.

1. Review outcome "request more information" for (a) vendor KYC review and (b) listing (asset) review.
   - Admin picks it with a mandatory message. The vendor sees the message on their dashboard and on the item.
   - Vendor KYC: add status "info_requested" to KYC_TRANSITIONS: pending → info_requested → pending
     (when the vendor resubmits). Listing: pending → info_requested → pending (when the vendor resubmits).
   - Audited with before/after and the message. Vendor gets a notification.
2. Maintenance status on a listing, separate from availability and from review status:
   "operational" | "under_maintenance" | "damaged" (default operational).
   - Vendor (owner/manager) and Admin can change it, with a reason for the last two. Audited.
   - A listing that is not operational is not quotable or bookable and shows "Under maintenance" / "Damaged" to clients.
     Existing bookings are not cancelled automatically; Admin sees them in a list to act on.
Tests: positive flows, wrong role 403, another vendor's listing 404, missing reason/message 400, invalid transition 409,
not-operational listing cannot be quoted (409).
UI: kit.tsx only; pill for the status; ask() for the reason. Update README status table.
```

### P1-B: Territory tree (database aur level ke naam tay hone ke baad)

```
Task P1-B. Territory tree from Founder's Blueprint §3.1, §4.3, §8. Foundation only: no Super Vendor screens.
- Territory: nextId("TER") id, name, levelKey, parentId, status active | retired (never deleted), createdAt.
  Level names and depth are configuration in system_settings (key "territory.levels"), e.g.
  ["state","zone","district","area"] — read the decided names from docs/VENDOR_BLUEPRINT_BUILD_PLAN.md
  "Decisions needed"; if missing, stop and ask (OWNER:).
- Parent must be exactly one level above. Retiring a node with active children → 409.
- Seed level 1 from INDIAN_STATES in packages/shared/src/geo.ts.
- Vendor operating territories: VendorTerritory { vendorId, territoryId, effectiveFrom, effectiveTo|null,
  createdBy, reason }. Changes end-date the old row; rows are never updated in place or deleted.
- Listing gets territoryId (the deepest node that contains it), chosen by the vendor, validated by Admin.
- Admin screen in AdminShell: tree view, add child, rename, retire (reason), with audit on every change.
- Permissions: territory.read (admin, vendor own), territory.manage (admin only).
Tests: tree rules, effective dating (history reconstructs past state), 403/404/400/409 negatives.
```

### P1-C: Super Vendor data foundation (P1-B aur Q6 ke baad)

```
Task P1-C. "Basic hierarchy database foundation" from Founder's Blueprint §4 and §7 Phase 1.
Data and Admin API only. No Super Vendor login, dashboards or allocation (those are Phase 2).
- NetworkNode: nextId("NET"), vendorId of the Super Vendor's organisation, levelKey (same config as P1-B), status.
- NetworkRelationship: parentNodeId, childVendorId or childNodeId, type primary | backup | direct,
  effectiveFrom, effectiveTo|null, reason, createdBy. End-dated, never overwritten or deleted.
- NodeTerritory: nodeId, territoryId, effective-dated.
- AssetNetworkAssignment: inventoryId, nodeId, effective-dated; overrides the vendor-level default.
- NO ownership fields anywhere in these tables (Blueprint §4.2). A vendor with no Super Vendor stays direct
  under Central Admin.
- Benchmarks (about 20–30 vendors per Area node, about 5 Area nodes per Zone) are settings that raise an
  Admin warning, never a hard limit.
- Permissions are granted per node explicitly (NetworkPermission rows); a level never implies a permission.
- Admin API: create node, link, end-date link (reason), list history as of a date. Audit every change.
Rules decided by the owner (Q6: who appoints, one per area or more) are in docs/VENDOR_ONBOARDING_REFERRAL_PLAN.md;
if not answered, stop and ask (OWNER:).
Tests: effective dating, no-ownership invariant, warnings not limits, 403/404/400/409 negatives.
```

### P1-D: Phase 3 screens chhupane ka switch (D6 ke baad)

```
Task P1-D. A setting "release.phase3_public" (default as decided in D6) that hides client inquiry, quote and
booking entry points on the public site and for client accounts when false. The API refuses those create
endpoints with 403 FEATURE_DISABLED when false; existing records stay readable. Admin can still use everything.
Audit the setting change (maker-checker like other sensitive settings). Tests for both values.
```

---

## 6. Section 10 ke documents (DOC tasks)

Ye sirf documents hain, code nahi. Har ek alag conversation mein karo. Diagram **Mermaid** mein likhwao, taaki GitHub
aur artifact dono mein dikhe. Founder ko bhejne se pehle khud padho.

| Task | File | Kis cheez se banega |
|---|---|---|
| DOC-1 System architecture diagram | `docs/section10/01-architecture.md` | `AGENTS.md` §2, `LAUNCH_GUIDE.md`, `apps/api/src/app.ts` |
| DOC-2 Database ER diagram | `docs/section10/02-er-diagram.md` | `apps/api/src/models/*.ts`, `docs/SCHEMA.md` |
| DOC-4 Role & permission matrix | `docs/section10/04-roles.md` | `packages/shared/src/roles.ts`, `docs/ROLE_PERMISSIONS.md`, founder §5.2 |
| DOC-5 Vendor registration workflow | `docs/section10/05-vendor-registration.md` | `VENDOR_ONBOARDING_ARCHITECTURE.md`, `KYC_TRANSITIONS` |
| DOC-6 Asset verification workflow | `docs/section10/06-asset-verification.md` | `LISTING_TRANSITIONS`, `services/inventory.ts`, build plan V1.8/V1.13 |
| DOC-7 API documentation check | `docs/openapi.yaml` | Har route file se milao; jo endpoint missing hai wo jodo |

DOC-3 (hierarchy diagram) P1-C ke baad. DOC-9 (timeline) aur DOC-10 (cost) owner / developer khud banayenge.

Prompt:

```
Task DOC-<n>: write <file> for the Founder (Blueprint Section 10, deliverable <n>). Documentation only, no code changes.
Read AGENTS.md, then the sources listed for this task in docs/PHASE1_PLAN_HINGLISH.md §6.
Describe what EXISTS in the code today; mark anything planned but not built as "Planned (task <id>)".
Never describe a capability that the code does not have. Use Mermaid for diagrams. Plain English, short sentences.
End with a list of open questions for the Founder.
```

---

## 7. Owner ke haath ke kaam

- §2 ke faisle, sabse pehle **database**.
- Founder blueprint PDF (`docs/DOC-20261126-WA0001.pdf`) abhi git mein nahi hai. Antigravity aapke computer pe chalta
  hai, to wahan se padh lega. Doosre developer ko chahiye to unhe alag se do; repo mein daalna hai ya nahi, ye aapka faisla.
- Har task ke baad review + merge + deploy aap ya aapka developer karega. Agent ko push mat karne do.
