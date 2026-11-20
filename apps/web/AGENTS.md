<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Accounts and sessions are real: the Express API in `apps/api` (MongoDB) owns them. `src/lib/api.ts` is the only fetch wrapper and `src/lib/auth.ts` holds session hooks and the route→role map that `AuthGate` uses; why: one place to change API contracts, and access is enforced server-side (the UI gate is UX only).
- Workspace screens for modules 2–9 still read the browser demo store (`src/lib/store.ts`, localStorage); its `role` is synced from the signed-in role by `useSyncDemoRole`. Move each screen onto `/api/v1` module by module and delete the matching store code; why: no screen may present sample data as real once its module is live.
- Routes render client-side (`defaultSsr: false` in `src/start.ts`); in dev, Vite proxies `/api` to `http://localhost:4000` (override with `API_PROXY_TARGET`); deployed builds use `VITE_API_URL`.
- Real quote/booking money rules (line maths, platform fee, 18% GST as CGST+SGST, cancellation fee schedule) live in `packages/shared/src/quote.ts` with tests and are recomputed by the API; screens only preview them. `src/lib/gst.ts` serves the remaining SAMPLE screens; why: one source of truth, and client-sent amounts are never trusted.
- Marketplace search, availability and shortlist come from `/api/v1` via `src/lib/marketplace-api.ts`; filtering happens on the server (tested in `apps/api/test/availability-search.test.ts`); why: list and map show the same server result set and nothing unapproved or DEMO can leak into it client-side.
- Sample reports derive scoped counts and activity from the browser store in `/reports`; why: reports must reflect existing records without presenting sample logs as protected production audit evidence.
