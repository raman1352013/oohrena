# OOHRENA v1.0 — module-wise gap analysis

Reviewed against all 35 pages of the uploaded compulsory-modules document before adding features. This is a frontend-only staging application, not an accepted production MVP. Every existing module is **UI / DEMO ONLY** because records live in one browser and there are no real APIs, database tables or authenticated accounts.

| Module | Existing frontend | Missing / untested requirements | Pages | Dependencies and timing |
|---|---|---|---|---|
| 1 Client Portal | Quotes, decisions, campaign progress, certified gallery, printable dossier | Registration, verification, persistent business profile, shortlist/compare, full search, invoices and history | `/`, `/client` | Frontend discovery/history updates in this request; real accounts and invoices require Cloud |
| 2 Vendor Portal | Asset submission, own demo orders, photo upload, payable view | Registration, KYC files, bank profile, Draft/Suspended states, calendar, CSV validation, video and periodic proof | `/vendor` | Secure onboarding/storage and availability model required; completion estimate after scope review |
| 3 Admin Control Tower | Lead queue, approved vendor selection, quote release, proof review, KYC decisions | Duplicate detection, sources/owner filters, reasons for KYC decisions, overrides, cancellation, complaints, searchable audit | `/admin`, `/admin/quote/$leadId`, `/admin/proof/$woId` | Activity search/report view in this request; protected workflows need Cloud |
| 4 Inventory Marketplace | City/category catalogue, photographs, detail dialog, monthly rates | Explicit demo labels, full category templates, units, quantity, update timestamps, CSV import, versioned edits | `/` | Demo trust labels in this request; verified inventory and metadata must be supplied |
| 5 Location & Availability | Map/grid, city filter, hold timer, booked label | Locality/landmark/PIN/GPS radius, date calendars, LED slots, fleet stock, vendor confirmation, transaction locks | `/` | Text/budget/radius discovery in this request; date-wise stock needs new data model |
| 6 Quote & Booking | GST breakup, draft, release, revisions, IDs, demo approval | Service/removal fees, immutable history enforcement, expired-approval enforcement, cancellation/rescheduling schedule | `/admin/quote/$leadId`, `/client`, `/print/quote/$quoteId` | Readable quote history in this request; fee schedule requires owner-approved values |
| 7 Execution & Proof | Day/night photos, simulated GPS, review/rejection, certified-only client gallery | Honest GPS labels, actual capture source, video, instructions/creative files, weekly proof, issue lifecycle | `/vendor`, `/admin/proof/$woId`, `/client` | Honest simulation labels in this request; real capture/storage and scheduling remain outstanding |
| 8 Finance | Demo escrow maker/checker queue, UTR, vendor payout, CSV | Client invoices/receipts, proof-backed payments, advance/balance, refunds, tax-safe reconciliation; automatic escrow is Phase 2 | `/finance` | Client financial status visibility in this request; verified receipt model and fee policy required |
| 9 Reports & Audit | Recent activity, printable dossier, finance CSV | Funnel/performance/exceptions, searchable logs, before/after records, notification templates/providers/delivery | `/admin`, `/finance`, `/print/dossier/$campaignId` | Reports/activity export in this request; append-only logs and notifications require Cloud/providers |
| 10 Security & Management | Staging role switch, browser JSON export | Real role enforcement, private files, named accounts, 2FA, session management, consent, approved legal documents, scheduled backup/restore | Shared header | Honest environment/backup labels in this request; company access, approved legal text and Cloud required |

## APIs and tables
No module currently has real application APIs or database tables. Existing entities are browser arrays: vendors, sites, leads, quotes, bookings, workOrders, campaigns, escrows and activity. These are not equivalent to the required server-side schema, access controls, transactions or audit records.

## Acceptance evidence
Prior demo walkthroughs are not evidence that T-01–T-14 pass. Production acceptance for **all fourteen tests remains NOT VERIFIED**. T-05 concurrency, T-11 evidence-backed receipts, T-13 server authorisation and T-14 database restore cannot pass on the current architecture. Frontend checks for this request are recorded separately after implementation.

## Scope and timing
This request updates frontend discovery, transparency labels, client history/status and reports. No production security, payment, GPS or availability claim will be made. Full-MVP completion timing cannot responsibly be estimated until real inventory, approved fees/legal terms, provider choices and the Cloud implementation scope are available. No module will be marked WORKING until its full acceptance test passes.

## Frontend verification — 18 November 2026

- Eight tests passed: existing GST/hold/GPS rules, discovery by city/locality, excluded listing states, monthly budget, GPS radius and index routing.
- Browser walkthrough passed: search, two-item shortlist/compare, submitted sample inquiry read back in Admin and activity reports, client quotation history and unrecorded-payment status.
- Marketplace screenshots inspected at 390×844, 744×1133, 1133×744 and 1280×832; no page-width overflow after fixing a clipped mobile statistics row. Comparison dialog, inquiry confirmation, client and reports screenshots inspected. No browser page errors in the final walkthrough; final build OK.
- Added: location/budget/radius discovery, session shortlist/comparison, quotation version links, booking/payment visibility, scoped sample funnel/tasks/activity filters and CSV export.
- Corrected: sample inventory, simulated GPS and browser export labels; removed public vendor identity and unverified traffic claims from inventory details.
- Still missing frontend: business/KYC/bank profiles, full availability calendar/slots/fleet quantities, inventory import/editing, complaint/override/cancellation screens, evidence-backed finance entry, notification management and legal/consent screens. This request is a partial alignment, not complete frontend compliance or MVP acceptance.