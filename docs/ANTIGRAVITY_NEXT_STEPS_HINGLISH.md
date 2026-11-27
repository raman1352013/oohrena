# Antigravity se agla kaam kaise karwana hai

Updated: 27 Nov 2026. Ye file **aapke liye** hai (owner / jo Antigravity chala raha hai). Task ke prompts already
`docs/WEEKEND_BUILD_PLAYBOOK.md` mein ready hain — yahan sirf **order, tareeka aur kya check karna hai** likha hai.

---

## 1. Abhi kahan hain (27 Nov)

- `main` pe sab merged hai, koi branch pending nahi. Tests 243/243 pass, typecheck clean, web build OK.
- Done: MVP modules 1–10, vendor blueprint P0, onboarding T1–T5 + T8, first-site step, sidebar sab roles ke liye,
  client quick quote, **booking sirf vendor confirm ke baad** (founder blueprint §6.1).
- Baaki: T6, T7, T9, T10 (vendor onboarding), client side ke 4 kaam, phir Sprint 1 (`docs/NEXT_TASKS.md`).
- `lovable` remote pe Harish ke 3 commits (Postgres SQL, alag JWT/OTP login, Vercel config) **merge nahi karne** —
  project MongoDB + `apps/api` session login pe chalta hai. Harish ko bolein: naya kaam isi repo
  (`raman1352013/oohrena`) mein `main` se branch banake, `AGENTS.md` padh ke.

---

## 2. Har task ka tareeka (har baar yahi 8 steps)

1. Terminal mein:
   ```sh
   git checkout main && git pull
   git checkout -b <task ki branch>
   ```
2. Antigravity mein **naya conversation** kholo. Ek task = ek conversation. Purani chat continue mat karo.
3. Mode: **Planning** (Fast nahi).
4. Paste karo: playbook §2 ka **Common prefix** + task ka **Prompt** (neeche table mein kahan milega).
5. Woh plan dikhayega — **code likhne se pehle padho**. Reject karo agar plan:
   - `routeTree.gen.ts`, `.env` ya finance models chhuta hai,
   - naya `/vendors/me/...` endpoint `routes/vendors.ts` ke bahar daalta hai,
   - kisi doosre task ki files chhuta hai,
   - koi rule (permission, audit, zod validation) skip karta hai.
6. Terminal permissions: `npm test`, `npm run typecheck`, `npm run build`, dev servers — haan.
   `git push`, `git reset --hard`, folder delete, `.env` — **nahi** (khud karo).
7. Jab bole "done": usse bolo `http://localhost:8080` pe seeded account se flow chala ke **375px (phone)** pe
   screenshot dikhaye. Screenshot khud dekho.
8. Playbook §3 ka **Review checklist** khud chalao. Sab theek ho to commit → push → `main` mein merge.
   Agent ki "done" pe merge mat karo.

**Ek waqt pe ek agent.** Sirf T7 doosre task ke saath parallel chal sakta hai (alag files).

---

## 3. Order (isi kram mein karo)

| # | Task | Branch | Prompt kahan hai | Kisi cheez pe ruka? |
|---|------|--------|------------------|---------------------|
| 1 | **T7** Listing fields (faces, illumination, rate includes…) | `feat/onboard-t7-listing-fields` | Playbook §4 T7 | Nahi |
| 2 | **T6** Wallet, share link, gift box | `feat/onboard-t6-wallet-giftbox-ui` | Playbook §4 T6 | Nahi |
| 3 | **T9** Public vendor profile `/v/<vendorId>` | `feat/onboard-t9-vendor-profile` | Playbook §4 T9 | Final look ke liye logo (owner) |
| 4 | **T10** Staging + 3 logon ke saath phone pe test | — (khud karo) | Playbook §4 T10 | T6, T7, T9 merged |
| 5 | Client: **Plan my campaign** brief | `feat/client-campaign-brief` | Neeche §4 | Spec pehle (neeche dekho) |
| 6 | Client: **Campaign timeline** | `feat/client-campaign-timeline` | Neeche §4 | Spec pehle |
| 7 | Client: **Proof + PDF report** screen | `feat/client-proof-report` | Neeche §4 | Nahi (API already hai: `/reports/client-campaign`) |
| 8 | **Email / WhatsApp updates** | `feat/notify-whatsapp` | Neeche §4 | WhatsApp provider account (owner) |
| 9 | Sprint 1: V1.8 → V1.9 → V1.11 → … | `docs/NEXT_TASKS.md` ke naam | `docs/VENDOR_BLUEPRINT_BUILD_PLAN.md` | V1.7 ruka hai D3 pe |
| — | Super Vendor network (T11) | — | **Abhi mat shuru karo** | Owner ke jawab Q5, Q6 + blueprint "relational DB" vs MongoDB |

---

## 4. Jin tasks ka prompt abhi nahi bana (5–8)

Inka spec likha hua nahi hai. **Antigravity se pehle spec likhwao, code nahi.** Common prefix ke baad ye paste karo:

```
Task: write a SPEC only, no code, for "<task name>" in docs/<FILE>.md.
Read AGENTS.md, README.md (module table) and the existing screens/API for this area first.
The spec must list: who uses it (role), screens (heading, fields, states: loading / empty / error, phone width),
API endpoints with permission + ownership rule, data model changes, audit events, and API test cases
including negatives (wrong role 403, other user's ID 404, bad input 400, bad transition 409).
Reuse what already exists (name the files). Mark every business decision you are unsure of as "OWNER:" — don't guess.
Phase 2 items (AI, dynamic pricing, payment gateway, native apps) are out of scope.
```

Spec padho, "OWNER:" wale sawaal ka jawab do, spec commit karo. **Phir naye conversation mein**:
`Common prefix + "Build docs/<FILE>.md exactly. Only this task."`

Task 7 (Proof + PDF report) ke liye spec ki zaroorat kam hai — API `GET /api/v1/reports/client-campaign/:campaignId`
already hai; prompt: *"Client 'Proof & updates' dialog mein PDF/CSV download button lagao jo is API ko call kare;
demo route `print.dossier.$campaignId.tsx` hatao (docs/REMAINING_WORK.md A.2)."*

---

## 5. Agent ko ye baatein pata honi chahiye (warna tests todega)

- **Booking sirf tab banti hai jab har site confirm ho.** "On request" listing pe quote ke baad vendor ko
  `POST /availability-requests/:id/vendor-response {response:"confirm"}` karna padta hai. Tests/seed mein ya to
  listing `managed` karo ya vendor se confirm karwao. (Ye `AGENTS.md` §6 mein likha hai.)
- `routeTree.gen.ts` build se apne aap badalta hai — commit mein aaye to sirf line-ending ho to `git checkout --` karo.
- Router shadowing, Mongoose 9 typing, transactions ke liye replica set — `AGENTS.md` §6.

---

## 6. Aapke (owner ke) haath ke kaam — agent nahi kar sakta

- D1–D7 decisions (`docs/NEXT_TASKS.md` "Blocked") — khaas kar **D3** (asset code) Sprint 1 rokta hai.
- Q5, Q6 Super Vendor ke liye; MongoDB vs "relational database" (founder blueprint) pe faisla.
- SMS (DLT sender) + WhatsApp provider account, vendor agreement ka legal text, `docs/OWNERSHIP_CONFIRMATION.md` sign.
- Render ke wipe hue disk se 10 live photos — vendors se dobara upload karwana.
- Har task ke baad merge + deploy aap ya aapka developer karega; agent ko push mat karne do.
