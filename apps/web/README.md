# OOHRENA Media Marketplace

OOHRENA — 360° Outdoor + Digital Advertising Marketplace web application banani hai, jisme Admin Control Tower, Public Media Marketplace, Client Portal aur Vendor Hub included ho. Ab advertising sirf dikhegi nahi... track bhi hogi.

### Locked
- Visual Direction: "Clean Commercial" adopted look. Midnight Navy top navigation and header (#0B192C), crisp off-white workspace canvas (#F8FAFC), pure white cards (#FFFFFF) with crisp borders (#E2E8F0), vibrant Saffron/Orange (#F97316 / #EA580C) for primary CTA buttons, SLA urgency alerts, and active indicators. Emerald green for verified status, amber for 48h hold locks.
- Branding & Identity: OOHRENA logo with gradient location pin mark, tagline "Outdoor x Digital x Trackable" and "Ab Advertising Sirf Dikhegi Nahi... Track Bhi Hogi!".
- 1-Click Staging Quick Role Switcher in header: Seamlessly test and switch between all verified roles (Admin: Central Operations Tower, Vendor: Bundelkhand Media & Gwalior Outdoor, Client: Tata Capital - Ananya Deshmukh, Finance: Meera Joshi Checker, Partner: City Growth Partner).
- Admin Control Tower Modules:
  1. Priority Lead Intake Queue: Lead ID (LD-...), Client Name, Target Corridor, Media Type, Budget, SLA countdown timer, Quick Actions to Assign Vendor & Generate Quote.
  2. 1-Click Itemized 18% GST Quotation Builder: Base Media Rent + Star Flex Printing + Frame Mounting + 18% GST (CGST + SGST) itemized calculation.
  3. 48-Hour Auto-Hold Lock Engine: Automatically locks site inventory for 48 hours upon quote dispatch to eliminate double-booking.
  4. Active Work Orders & SLA Tracker: Work Order ID (WO-...), Booking ID (BK-...), Assigned Vendor, Mounting Deadline, Live Execution Status.
  5. Proof of Display Certification Queue: Dual Day & Night photo verification with hardware GPS coordinate check (<50m threshold), mandatory rejection reason, and certification trigger to release proof to client and unlock finance escrow.
- Core Operating Principle: Client Transparency First. Every record follows the parent-child relational chain: Lead ID -> Quote ID -> Booking ID -> Work Order ID -> Campaign ID -> Escrow Payment Reference. No lead bypasses Admin review.

### Open
- Public Media Inventory Marketplace: City selector (Delhi, Mumbai, Bengaluru, Hyderabad, Chennai, etc.), category filters (Hoardings/Billboards, Digital LED Screens, E-Rickshaw/Promo Vans, Bus/Metro Transit, Gantry, Retail Indoor), map and grid view, media detail modal with dynamic rate card, and "Request Quotation" modal.
- Client Portal: Self-service client dashboard showing open quotations (Approve, Reject, Request Revision), 48h hold status, certified Day/Night GPS proofs, and 1-click printable Campaign Audit Dossier PDF.
- Vendor Space Hub: Media asset upload form with GPS coordinates, size, rate card, assigned work orders, and camera proof upload simulation.
- Finance Maker-Checker Ledger: Dual-party payment audit, escrow release after proof certification, and 1-click CSV reconciliation export.
- Pre-seeded realistic demo data matching the handover dossier (Tata Capital, Bundelkhand Media, Gwalior Outdoor, Apex Healthcare).

build a real working app, not a clickable prototype; the screen and kit files show layout, content and look (a wireframe's, structure only) and are never code to copy. The screens are the moments the user designed, not the whole product. Before building, walk through each flow as its user would and design what the pictures leave out, as a product designer would for this product: the steps a flow needs to finish and how the app responds to what the user does, including the moments its users will actually run into, like waiting on something or finding nothing yet. Add nothing a user of this product would never meet, and keep an app the user wants simple, simple. Never leave a step the product's core flows need as "coming soon", unless the brief says the user chose to. Where such a step needs an outside service, build every part up to it and say in your reply what's left to connect. Fill product gaps only, never a look the design set: an added step reuses the UI kit's tokens, chrome and parts and the nearest designed screen's layout, with no new visual direction. Look at every screen's picture before writing code; design.md says which picture or sheet holds each screen. Open the UI kit's shells and parts HTML for the header, tab bar, composer and components, not only its tokens. Use each finished screen's copy exactly as design.md lists it; never invent copy for one. A wireframe under design.md's Wireframes gives structure only: build it in the design's look, as design.md says. The screens' photos are placeholders for the mockups only: replace every photo design.md lists with the user's own upload for it, else as design.md says (a photo without people re-composed with imagegen--edit_image from it as a reference, a photo of people generated from its brief and never from the photo), and ship no set photo or its URL. For a design that came with no design.md, every photo on assets.lovable.dev or images.unsplash.com is a set photo: replace it with the user's own upload for it, else a new image generated for its slot, any person in it one who doesn't exist, never from the photo or a picture showing it. Build and check each screen at the canvas it was drawn at: phone 393×764, tablet landscape 1133×744, tablet portrait 744×1133, desktop 1280×832. After building, screenshot the app at those sizes and states, compare each finished screen with its picture, and fix every visual difference you didn't choose; check a wireframe's screen against its structure, never its grey look. End your reply with "Changed from the mockups": each deliberate change and why, and "Added beyond the mockups": each step, state or interaction you built that no screen shows.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ea9d9c14-dc2c-4140-8daf-ba4ec8fb6db5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
