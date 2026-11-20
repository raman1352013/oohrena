# OOHRENA — Role-Permission Matrix

This document is generated directly from the single source of truth: `packages/shared/src/roles.ts`.
Every endpoint in the OOHRENA platform enforces this matrix on the server. Foreign-ID requests return **HTTP 404** (not 403) so IDs cannot be probed. Hiding a UI button is never security.

## The Five Roles

| Role Key | Role Label | Description |
|----------|------------|-------------|
| `client` | Client / Agency | Finds media, requests quotes, approves quotations, views certified campaign execution proof & reports. |
| `vendor` | Vendor / Media Owner | Lists verified inventory, manages holds/calendar, executes work orders, uploads geotagged display proof, receives payables. |
| `admin` | Central Admin | Oversees the entire marketplace: vendor KYC verification, listing approval, quotation creation/pricing, work orders, exceptions, overrides. |
| `growth_partner` | Growth Partner | External partners bringing client inquiries; access strictly limited to own leads and partner earnings. |
| `finance` | Finance / Audit | Maker-checker financial control: verifies client receipts, executes vendor payouts, issues GST invoices and reconciliation reports. |

---

## Role-Permission Matrix Table

*Scopes*:
- **all**: Unrestricted access across all marketplace records.
- **own**: Restricted strictly to records created by or belonging to the caller's organization.
- **assigned**: Restricted strictly to records explicitly assigned to this vendor or user.
- **—**: No access (HTTP 403 Forbidden).

| Permission | Module | Client | Vendor | Admin | Growth Partner | Finance | Description |
|------------|--------|:------:|:------:|:-----:|:--------------:|:-------:|-------------|
| `users.manage` | Module 10 | — | — | **all** | — | — | Create staff users, suspend/reactivate accounts, manage sessions. |
| `users.role.assign` | Module 10 | — | — | **all** | — | — | Reassign user roles with mandatory reason and recent re-authentication. |
| `audit.read` | Module 10 | — | — | **all** | — | **all** | Query and export append-only immutable audit trail logs. |
| `system.deployments.read` | Module 10 | — | — | **all** | — | — | View CI/CD deployment history, backup/restore events and system health. |
| `client.profile` | Module 1 | **own** | — | — | — | — | Manage own company profile, GSTIN, contacts and billing addresses. |
| `leads.create` | Module 1/3 | **own** | — | **all** | **own** | — | Submit new inquiries/leads into the Central Admin inbox. |
| `leads.read` | Module 1/3 | **own** | — | **all** | **own** | — | Read inquiries/leads (scoped to own submissions). |
| `partner.earnings.read` | Module 10 | — | — | **all** | **own** | **all** | View Growth Partner commission earnings, conversion rates and payouts. |
| `quotes.decide` | Module 1/6 | **own** | — | — | — | — | Accept, reject or request revisions on quotations. |
| `shortlist.manage` | Module 1 | **own** | — | — | — | — | Add, compare and remove inventory items from candidate shortlists. |
| `vendor.profile` | Module 2 | — | **own** | — | — | — | Manage media owner profile, legal name, PAN and GSTIN. |
| `vendor.bank.read` | Module 2/8 | — | **own** | — | — | **all** | View bank details (Finance sees full unmasked with re-auth; masked for others). |
| `inventory.manage` | Module 2/4 | — | **own** | **all** | — | — | Create, edit and submit inventory listings for admin verification. |
| `workorders.read` | Module 6/7 | **own** | **assigned** | **all** | — | — | View campaign work orders and scheduled proof milestones. |
| `workorders.execute` | Module 7 | — | **assigned** | **all** | — | — | Advance work order states (Printing, Mounting, Live) and upload display proofs. |
| `proofs.decide` | Module 7 | — | — | **all** | — | — | Verify or reject uploaded proof photos/videos with mandatory reasons. |
| `issues.manage` | Module 7 | — | — | **all** | — | — | Log, track, reassign and resolve campaign execution issues. |
| `vendors.kyc.decide` | Module 3 | — | — | **all** | — | — | Approve, reject, suspend or reinstate vendor KYC with mandatory reasons. |
| `inventory.decide` | Module 3/4 | — | — | **all** | — | — | Approve, reject, suspend or reinstate listings with indicative pricing. |
| `leads.assign` | Module 3 | — | — | **all** | — | — | Assign verified vendors to client inquiries. |
| `quotes.manage` | Module 3/6 | — | — | **all** | — | — | Draft, price, revise and release quotations with 48h holds. |
| `overrides.create` | Module 3 | — | — | **all** | — | — | Execute operational overrides with mandatory reason and permanent audit log. |
| `holds.manage` | Module 5 | — | — | **all** | — | — | Place and manage 48-hour transactional holds on inventory. |
| `availability.block` | Module 5 | — | **own** | **all** | — | — | Block calendar dates for maintenance, outages or private bookings. |
| `availability.respond` | Module 5 | — | **own** | — | — | — | Confirm or reject availability requests within SLA windows. |
| `finance.manage` | Module 8 | — | — | — | — | **all** | Complete financial operations, reconciliation and billing ledger views. |
| `finance.record` | Module 8 | — | — | **all** | — | **all** | Record client payment receipts or vendor payouts (Maker). |
| `finance.verify` | Module 8 | — | — | — | — | **all** | Verify recorded payments with maker-checker separation (Checker only). |
| `payables.read` | Module 8 | — | **own** | — | — | **all** | View vendor payable dues, invoice numbers and payout statuses. |
| `payments.read.own` | Module 8 | **own** | — | — | — | — | View own payment receipts, advance milestones and invoice balance. |
| `finance.status.read` | Module 8 | — | — | **all** | — | **all** | View payment status indicators without unmasked banking details. |
| `reports.admin` | Module 9 | — | — | **all** | — | **all** | Generate Funnel, Revenue & Margins, Exceptions, and Vendor Performance reports. |
| `reports.client_campaign` | Module 9 | **own** | — | **all** | — | **all** | Download certified Campaign Execution Dossiers (PDF/CSV) with verified proofs. |
| `reports.vendor_performance` | Module 9 | — | **own** | **all** | — | **all** | Access Vendor Performance Scorecards (hold SLA, proof rejection rate, issues). |
| `notifications.manage` | Module 9 | — | — | **all** | — | — | Edit and configure event notification templates (email, SMS, WhatsApp). |
| `notifications.read` | Module 9 | — | — | **all** | — | — | Audit notification delivery logs and status across all channels. |

---

## Privileged Security Controls
- **Mandatory 2FA (TOTP)**: Admin and Finance accounts require RFC 6238 two-factor authentication and hashed one-time recovery codes in production (`REQUIRE_2FA_PRIVILEGED=true`).
- **Recent Re-Authentication (`requireRecentAuth`)**: Actions involving financial verification, role changes, operational overrides, KYC decisions, listing approval, unmasked bank details, and data exports require password + 2FA re-authentication within the past 10 minutes.
- **Maker-Checker Separation**: A user who records a payment (`finance.record`) cannot verify that payment (`finance.verify`).
- **Append-Only Audit**: All sensitive views and state mutations write immutable entries to `audit_logs`.
