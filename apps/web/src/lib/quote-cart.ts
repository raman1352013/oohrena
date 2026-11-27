import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { PublicListing } from "@oohrena/shared";
import { useShortlist, useToggleShortlist } from "./marketplace-api";

/**
 * The "quote cart": sites a buyer wants a quote for.
 * Signed-in clients use their server shortlist; visitors keep it in this browser until they ask for a
 * quote (then it becomes the inquiry). One inquiry takes up to 20 sites (leadCreateInput).
 */
export const CART_MAX = 20;

export type CartSite = {
  inventoryId: string;
  title: string;
  category: string;
  quantity: number;
  /** DEMO / unverified sites can be saved but never quoted (AGENTS.md §4.8). */
  bookable: boolean;
};

export const toCartSite = (l: PublicListing): CartSite => ({
  inventoryId: l.inventoryId,
  title: l.title,
  category: l.category,
  quantity: l.quantity,
  bookable: l.bookable,
});

const KEY = "oohrena.quoteCart.v1";
const listeners = new Set<() => void>();
let cache: CartSite[] | null = null;

const isSite = (x: unknown): x is CartSite =>
  !!x &&
  typeof (x as CartSite).inventoryId === "string" &&
  typeof (x as CartSite).title === "string" &&
  typeof (x as CartSite).category === "string";

function read(): CartSite[] {
  if (cache) return cache;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    cache = Array.isArray(v) ? v.filter(isSite).slice(0, CART_MAX) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(sites: CartSite[]) {
  cache = sites;
  try {
    localStorage.setItem(KEY, JSON.stringify(sites));
  } catch {
    // Private mode or blocked storage: the cart still works for this page view.
  }
  listeners.forEach((l) => l());
}

const EMPTY: CartSite[] = [];
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export type QuoteCart = {
  sites: CartSite[];
  has: (id: string) => boolean;
  /** Adds or removes a site. Resolves false when the cart is already full. */
  toggle: (site: CartSite) => Promise<boolean>;
  /** Empties the visitor cart after an inquiry (a client's shortlist is kept). */
  clearLocal: () => void;
};

export function useQuoteCart(isClient: boolean): QuoteCart {
  const local = useSyncExternalStore(subscribe, read, () => EMPTY);
  const shortlist = useShortlist(isClient);
  const toggleServer = useToggleShortlist();

  const sites = useMemo<CartSite[]>(
    () =>
      isClient
        ? (shortlist.data ?? []).flatMap((s) => (s.listing ? [toCartSite(s.listing)] : []))
        : local,
    [isClient, shortlist.data, local],
  );
  const ids = useMemo(() => new Set(sites.map((s) => s.inventoryId)), [sites]);

  const toggle = useCallback(
    async (site: CartSite) => {
      const on = !ids.has(site.inventoryId);
      if (on && ids.size >= CART_MAX) return false;
      if (isClient) await toggleServer.mutateAsync({ id: site.inventoryId, on });
      else write(on ? [...read(), site] : read().filter((x) => x.inventoryId !== site.inventoryId));
      return true;
    },
    [isClient, ids, toggleServer],
  );

  return {
    sites,
    has: (id) => ids.has(id),
    toggle,
    clearLocal: () => write([]),
  };
}
