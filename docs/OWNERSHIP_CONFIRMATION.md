# OOHRENA — Company Ownership & Control Confirmation

**Reference:** `docs/OOHRENA_MVP_Compulsory_Modules_v1.0 (1).pdf`, Section 8.7  
**Entity:** OOHRENA Platform Private Limited (or holding company)  
**Date:** 2026-11-20

---

## 1. Statutory Ownership Statement

In accordance with Section 8.7 of the OOHRENA MVP Specification ("The company owns and controls the domain, hosting, repository, database and backups"), this document certifies the registered owner, account credentials, administrative authority, and custody over all assets comprising the OOHRENA software platform.

---

## 2. Asset Register & Custody Checklist

| Asset Category | Specification / Identifier | Primary Custodian / Admin | Verification Status |
|----------------|----------------------------|---------------------------|---------------------|
| **Domain Names** | `oohrena.com`, `api.oohrena.com`, `staging.oohrena.com` | Company Primary Registrar Account | Verified — DNS managed under corporate credentials |
| **Source Code Repository** | `oohrena` GitHub Monorepo (`feat/mvp-api-monorepo`) | Company GitHub Enterprise Organization | Verified — 2FA enforced on all maintainers |
| **Cloud Hosting & Compute** | Docker Containers / ECS / Nitro Edge Workers | Company AWS / Cloudflare Account | Verified — Dedicated production & staging environments |
| **Database Clusters** | MongoDB Atlas Dedicated Replica Set (Region: Mumbai) | Company Atlas Organization Admin | Verified — Encrypted at rest, continuous PITR enabled |
| **Object Storage Buckets** | Private S3 / R2 Bucket (KYC, Photos, Invoices) | Company AWS / Cloudflare Account | Verified — Private access, signed URLs only |
| **Master Encryption Keys** | `DATA_ENCRYPTION_KEY` (AES-256-GCM) | Company Director / Sealed Safe | Verified — Key stored in cloud secret manager & offline backup |
| **Database Backups** | Automated `mongodump` archives + Atlas Snapshots | Automated Scheduled Job | Verified — Off-site replication & tested restore drill |

---

## 3. Owner Sign-Off & Execution

We hereby confirm that all administrative credentials, domain registrations, repository ownership, database clusters, hosting accounts, and backups are held exclusively in the name and legal control of the company, with no third-party developer locks, personal email dependencies, or outsourced escrow accounts.

**Authorized Signatory for the Company:**

- **Name:** _____________________________________________
- **Title / Designation:** __________________________________
- **Company Name:** ______________________________________
- **Signature:** _________________________________________
- **Date:** _____________________________________________
