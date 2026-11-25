# Vendor onboarding, referral coins & vendor profile — UX spec

Written 25 Nov 2026. Read with `docs/VENDOR_ONBOARDING_ARCHITECTURE.md` (what the API does) and `AGENTS.md` §5a (copy and layout rules).
Every UI task (T2, T4, T6, T8, T9) must follow this file. If a screen here and a task prompt disagree, this file wins for the UI.

---

## 1. Who we design for

| Person | Device & situation | What they need |
|---|---|---|
| **Vendor owner** (Jaipur, 15 hoardings) | Android phone, 4G, often outdoors, typing in English with Hindi in mind | Finish sign-up in under 1 minute; fill the long form in parts, never lose what they typed; know exactly what is left |
| **Client / agency** | Laptop or phone | Sign up fast, share a link, see coins |
| **Verifier / admin** | Laptop | Review a vendor in one screen, decide fast, never miss a document |
| **Someone opening a shared link** | WhatsApp in-app browser | See who invited them is real (OOHRENA brand), sign up in one go |

**Design for the vendor on a phone first.** Every screen is built at 375 px width, then widened.

## 2. Principles (apply to every screen)

1. **Ask little, then ask the rest later.** Sign-up = 6 fields for clients, 7 for vendors (+ business name, category). Everything else goes in the wizard after login (agreed in the team discussion).
2. **Nothing typed is ever lost.** Each wizard step saves to the server on "Save & next". A step half-filled and left is kept as a local draft (localStorage, try/catch) and restored with a `Notice` "Unsaved changes restored".
3. **Always show where you are.** Step list with ticks; on phones a compact bar "Step 3 of 8 · Territory" plus a progress bar.
4. **One primary action per screen**, at the bottom, thumb-reachable. On phones it sits in a sticky footer (`sticky bottom-0`, safe-area padding).
5. **Errors next to the field, in plain words.** Show them on submit (not while typing), move focus to the first invalid field and scroll it into view. Server field errors map onto the same fields. Never a generic "Something went wrong" when the API returned a field.
6. **Honest states.** Coins are "Pending" until they are really usable. "Verified" only when the API says approved. No fake numbers (AGENTS §5a).
7. **Short copy.** Labels are nouns. No helper paragraphs. A rule with consequences may sit in the label or a `Pill` ("Unlocks after KYC approval").
8. **Kit only.** `KCard`, `Btn`, `Pill`, `Stats`, `Tabs`, `Notice`, `Empty`, `Loading`, `Row`; `Field` / `FormError`; `Dialog`; `ask()` for confirmations. Checkboxes/radios from `components/ui`.

## 3. Input details (these make or break the phone experience)

| Field | Attributes |
|---|---|
| Mobile, WhatsApp | `type="tel" inputMode="tel" autoComplete="tel"` |
| Email | `type="email" inputMode="email" autoComplete="email" autoCapitalize="none"` |
| Password | `autoComplete="new-password"` + show/hide toggle (eye icon, `aria-label`) |
| Full name | `autoComplete="name" autoCapitalize="words"` |
| PAN, GSTIN, IFSC, Udyam, referral code | `autoCapitalize="characters"`, convert to upper case as they type, `spellCheck={false}`, max length set |
| PIN code | `inputMode="numeric" autoComplete="postal-code" maxLength={6}` |
| Counts, hours, year | `inputMode="numeric"` (not `type="number"` — no scroll-wheel changes, no "e") |
| City / district | text; later a list from location masters |
| State | `select` from `INDIAN_STATES` (never free text) |
| Multi-choice (categories, services, states served) | large tappable chips/checkbox rows, min 44 px tall |
| Yes/No | two-option segmented control, not a single checkbox (the PDF's ■ Yes ■ No) |
| Dates | existing date input / `ask({ date })` pattern |

Every field: visible label, `aria-invalid` + `aria-describedby` on error (already in `Field`), `enterKeyHint="next"` except the last (`"done"`).

## 4. Screens

### 4.1 Sign-up `/register` (T2)

```
┌──────────────────────────────┐
│ [OOHRENA logo]               │
│ Create account               │
│ ( Advertiser | Media owner ) │  ← segmented, from ?as=vendor
│                              │
│ Full name                    │
│ Mobile                       │
│ Email                        │
│ Password            [👁]     │
│ City                         │
│ What you do  (vendor only)   │
│ [Media owner] [Execution]    │
│ [Aggregator] [Agency] [Other]│
│                              │
│ ✓ Referral OOH-7K2Q9M  [×]   │  ← only when a code is present
│   or  "Have a referral code?"│  ← link that reveals the field
│                              │
│ ☐ I accept the Terms …       │
│ [ Create account ]           │  ← sticky on phone
│ Already registered? Sign in  │
└──────────────────────────────┘
```
- Vendor also needs **Legal / business name** (existing API) — keep it, label "Business name".
- PAN/GSTIN are **not** here.
- Referral: if `?ref=` or a saved code exists, show it as an applied chip with a remove (×). Don't show whose code it is (no lookup endpoint — that would let people probe codes). Invalid codes are not shown as errors (the server ignores them silently); the form still submits.
- On success: go straight to the vendor wizard (vendor) or client home (client). No "check your email" dead end.
- Conflict (email/mobile taken): error on that field + "Sign in instead" link.

### 4.2 Vendor home before onboarding is submitted (T4)

`/vendor` shows the wizard instead of dashboard tabs. Header: business name + KYC pill.

**Desktop:** left step list (240 px) + form on the right.
**Phone:** top bar `Step 3 of 8 · Territory` + thin progress bar; tap it to open the step list as a `Sheet` from the bottom.

Step list item states: `done` (tick), `current` (bold), `todo`, `error` (red dot — saved before but now invalid, e.g. PAN rejected as duplicate).

```
Business ✓ · Category ✓ · Territory ● · Execution · Availability & SLA · Documents · Bank · Declaration
```

Rules:
- Steps can be opened in any order; "Save & next" goes to the next **unfinished** step.
- Footer: `[Back]` ghost + `[Save & next]` primary. Last step: `[Submit for review]`.
- Leaving a step with unsaved edits → `ask({ title: "Leave without saving?", action: "Leave", danger: true })`.
- Saved → `toast.success("Saved")`, tick appears; no page jump.
- **Business step** shows PAN first (it unlocks KYC). GSTIN optional; if typed, the PAN/GSTIN mismatch error shows on GSTIN.
- **Territory / execution**: multi-selects as chips; "Other cities" as type-and-Enter chips.
- **Documents step**: reuses `KycPanel` upload. Shows the §F checklist with what's uploaded (tick + file name) and what's required (`Pill` "Required" on PAN). Upload progress per file; retry on failure.
- **Bank step**: owner only; managers see `Notice` "Owner adds bank details" and the step counts as not required for them to continue — but submit stays owner-only.
- **Declaration step**: the 9 items as checkbox rows (full text from `DECLARATION_ITEMS`, no extra explanation), "Accept all" at the top, then signatory name, designation, place. Submit is disabled until all other steps are done; missing steps show as clickable `Pill`s ("Territory", "Bank") that jump to that step.

### 4.3 The gift box 🎁 (T6)

The memorable moment the team asked for. Short, honest, skippable.

```
 1. Full-screen dialog, dark overlay, closed gift box (OOHRENA green ribbon) gently bouncing.
 2. Tap the box (or auto after 600 ms) → lid lifts, light burst, coins rise.
 3. Counter counts up 0 → 25 (≈ 800 ms).
 4. "25 coins" big · Pill "Pending — unlocks after KYC approval"
 5. "Saved to your wallet"
    [ Share & earn more ]  primary  → opens Share sheet (4.5)
    [ Go to dashboard ]    ghost
```
- Numbers come **only** from the submit response `reward`. If `reward` is null, no gift box.
- Shown once per submit (the response triggers it; reload doesn't replay it).
- `prefers-reduced-motion`: no bounce/burst/count — show step 4–5 directly.
- Counter is in an `aria-live="polite"` region; dialog has a focus trap and Esc closes it.
- CSS transforms only, no animation library; 60 fps on a mid-range Android (animate `transform`/`opacity` only).
- Sound: none.

### 4.4 Vendor home after submit (T4)

| KYC state | What the vendor sees at the top |
|---|---|
| submitted, pending | `Pill` "Under review" · wizard steps read-only (view) · dashboard tabs available |
| rejected | `Notice` (danger) with the admin's reason + `[Fix and resubmit]` → opens the wizard at the first step the reason concerns (or step 1) |
| approved | `Pill` "Verified" · link "View public profile" |
| suspended | `Notice` with reason; listings hidden |

Add a **Wallet** tab to the dashboard tabs.

### 4.5 Wallet & share (T6) — tab on vendor, client and partner screens

```
┌──────────────────────────────┐
│ Wallet                       │
│ [ Available 125 ] [Pending 50]│  ← Stats
│                              │
│ Your code   OOH-7K2Q9M  [Copy]│
│ [ Share ]                    │  ← native share sheet on phones
│                              │
│ Rewards                      │  ← small table, from settings via API
│ Vendor joins   100           │
│ Client joins    50           │
│                              │
│ Referrals                    │
│ Ra*** Ku***  Vendor  Pending  100 │
│ Am*** Sh***  Client  Earned    50 │
│                              │
│ History                      │
│ +100  Referral reward  12 Nov│
└──────────────────────────────┘
```
- **Share button**: `navigator.share({ title, text, url })` when available (phones); otherwise a small menu: WhatsApp (`https://wa.me/?text=`), Copy link. Copy shows `toast.success("Link copied")`.
- Share text lives in `lib/share-text.ts` (one place for the owner to edit; can carry the "Global Media Kalpavriksha" line). Link: `<site>/register?ref=CODE` (vendors: `&as=vendor` when sharing to vendors — two buttons "Invite a vendor" / "Invite a client" so the right sign-up tab opens).
- Referral row statuses: `Pending` (saffron), `Earned` (verified/green), `Not eligible` (neutral) — never show the internal reject reason to the sharer.
- Empty: `<Empty title="No referrals" />` under the share card (the share card itself is the call to action).
- Growth partners: code and share work; rewards table shows nothing earned for them (Q10) — hide the Rewards block for that role.

### 4.6 Public vendor profile `/v/VND-000123` (T9)

```
┌──────────────────────────────┐
│ [logo/initials] Shree Outdoor│
│ Jaipur, Rajasthan · Verified │
│ Media owner · Execution      │
│ Member since Nov 2026        │
│ [ Request a quote ]          │  ← goes to the normal enquiry flow (admin in the middle)
│                              │
│ Sites (14)                   │
│ [card][card]                 │  ← same card as marketplace, verified & non-DEMO only
└──────────────────────────────┘
```
- No phone, email, address line or PAN — ever.
- Unknown / not approved → the normal 404 page ("Vendor not found"), no hint why.
- Page `<title>`: "<Name> — OOHRENA". Share button (same share helper) so vendors can post their own profile.
- WhatsApp link previews: the web app renders client-side, so per-vendor previews won't show the vendor's name. Use the generic OOHRENA preview image/text for now; per-vendor previews need server rendering (later).

### 4.7 Admin vendor review (T8)

Desktop-first, inside `AdminShell`.
- Left: onboarding data in sections A–K (read-only `Row`s), documents with view buttons (viewing is audited), PAN masked.
- Right (sticky): the §L checklist — each item as a 3-way segmented control (Pending / Verified / Rejected; Asset: + Partial; Rate card: Pending / Approved / Clarification), site visit Yes/No, territory note, remarks, next review date, `[Save review]`.
- Decision buttons (existing KYC endpoint): `[Approve]` primary, `[Reject]` danger → `ask()` for the reason (mandatory).
- If any item is Rejected, Approve is disabled and the reason is required.
- Queue: "Submitted" list sorted oldest first with age ("3 days").

## 5. States checklist (every screen)

| State | Pattern |
|---|---|
| Loading | `<Loading />` (never a sentence) |
| Empty | `<Empty title="No …" />` |
| Error loading | message + `[Try again]` (as in `routes/vendor.tsx`) |
| Saving | button shows a spinner and is disabled; double submit impossible |
| Offline / network fail on save | `toast.error` + the draft stays in the form (and localStorage) |
| Permission (e.g. field staff) | they don't see the wizard; show their own tabs only |

## 6. Accessibility & performance

- Tap targets ≥ 44 × 44 px; text ≥ 13 px; contrast AA in light and dark.
- Keyboard: tab order follows the screen; Enter submits the step; focus visible.
- Every icon-only button has `aria-label`.
- Images lazy-loaded; wizard steps code-split if the bundle grows; no new UI library.
- Test at 375 × 812 (phone), 768 (tablet), desktop; light and dark.

## 7. Hindi

The UI is English for this release (labels are short nouns, easy to translate later). Hindi + English is a non-functional item in `NEXT_TASKS.md`; keep all new strings in the component files (not built by string concatenation) so they can be extracted later.

## 8. UX acceptance per task (check in the browser before merging)

| Task | Must be true |
|---|---|
| T2 | Vendor signs up on a phone in under 60 s with 6–7 fields; `?ref=` survives a page reload and shows as an applied chip; email-taken error sits on the Email field |
| T4 | Fill 2 steps, close the tab, come back → both saved, current step restored; unsaved edits ask before leaving; submit disabled with missing-step pills that jump; works at 375 px with sticky footer |
| T6 | Gift box shows the exact `reward` numbers, once; reduced-motion shows no animation; Share opens the phone share sheet; pending coins never shown as earned |
| T8 | Reviewer can approve/reject without scrolling the checklist out of view; reject asks for a reason; PAN masked |
| T9 | Profile shows no private field; unapproved vendor → 404; works at 375 px |
