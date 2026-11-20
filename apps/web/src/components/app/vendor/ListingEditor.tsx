import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, MapPin, X } from "lucide-react";
import type { ZodIssue } from "zod";
import {
  CATEGORY_DEFS,
  MAX_PHOTOS_PER_LISTING,
  MAX_PHOTO_BYTES,
  PRICING_UNIT_LABEL,
  categoryDef,
  inventoryCreateInput,
  inventoryUpdateInput,
  type CategoryId,
  type PricingUnit,
} from "@oohrena/shared";
import { ApiError, assetUrl } from "@/lib/api";
import {
  useCreateListing,
  useRemovePhoto,
  useSubmitListing,
  useUpdateListing,
  useUploadPhotos,
  type Listing,
} from "@/lib/inventory-api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Btn } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { ListingPill } from "@/components/app/status";
import { selectCls } from "@/lib/format";

type Form = {
  category: CategoryId;
  title: string;
  description: string;
  city: string;
  locality: string;
  landmark: string;
  address: string;
  pin: string;
  lat: string;
  lng: string;
  rate: string;
  pricingUnit: PricingUnit;
  quantity: string;
  attributes: Record<string, string | boolean>;
};

const blank = (): Form => ({
  category: "hoarding",
  title: "",
  description: "",
  city: "",
  locality: "",
  landmark: "",
  address: "",
  pin: "",
  lat: "",
  lng: "",
  rate: "",
  pricingUnit: "per_month",
  quantity: "1",
  attributes: {},
});

const fromListing = (l: Listing): Form => ({
  category: l.category as CategoryId,
  title: l.title,
  description: l.description ?? "",
  city: l.city,
  locality: l.locality,
  landmark: l.landmark ?? "",
  address: l.address,
  pin: l.pin,
  lat: String(l.lat),
  lng: String(l.lng),
  rate: String(l.rate),
  pricingUnit: l.pricingUnit,
  quantity: String(l.quantity),
  attributes: Object.fromEntries(
    Object.entries(l.attributes).map(([k, v]) => [k, typeof v === "boolean" ? v : String(v)]),
  ),
});

const issueMap = (issues: ZodIssue[]) =>
  Object.fromEntries(issues.map((i) => [i.path.join("."), i.message]));

/** Create/edit a listing. Mandatory fields are validated with the same schema the API uses. */
export function ListingEditor({
  listing,
  open,
  onClose,
}: {
  listing?: Listing | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateListing();
  const update = useUpdateListing();
  const photos = useUploadPhotos();
  const removePhoto = useRemovePhoto();
  const submit = useSubmitListing();
  const [current, setCurrent] = useState<Listing | undefined>(listing);
  const [f, setF] = useState<Form>(listing ? fromListing(listing) : blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setCurrent(listing);
    setF(listing ? fromListing(listing) : blank());
    setErrors({});
    setFormError(undefined);
  }, [open, listing]);

  const def = categoryDef(f.category)!;
  const status = current?.status;
  const editable = !current || status === "draft" || status === "rejected" || status === "approved";
  const set =
    (k: keyof Form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setF({ ...f, [k]: e.target.value });

  function pickCategory(c: CategoryId) {
    const d = categoryDef(c)!;
    setF({
      ...f,
      category: c,
      pricingUnit: (d.units as readonly PricingUnit[]).includes(f.pricingUnit)
        ? f.pricingUnit
        : d.units[0],
      attributes: {},
    });
  }

  function useGps() {
    if (!navigator.geolocation)
      return toast.error("This device can't share its location. Enter coordinates manually.");
    navigator.geolocation.getCurrentPosition(
      (p) =>
        setF((x) => ({
          ...x,
          lat: p.coords.latitude.toFixed(6),
          lng: p.coords.longitude.toFixed(6),
        })),
      () => toast.error("Location permission denied. Enter coordinates manually."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
    return undefined;
  }

  function payload() {
    return {
      category: f.category,
      title: f.title,
      description: f.description || undefined,
      city: f.city,
      locality: f.locality,
      landmark: f.landmark || undefined,
      address: f.address,
      pin: f.pin,
      lat: f.lat,
      lng: f.lng,
      rate: f.rate,
      pricingUnit: f.pricingUnit,
      quantity: f.quantity || 1,
      attributes: Object.fromEntries(Object.entries(f.attributes).filter(([, v]) => v !== "")),
    };
  }

  function onServerError(err: Error) {
    if (err instanceof ApiError && Object.keys(err.fieldErrors).length)
      setErrors(
        Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? ""])),
      );
    setFormError(err.message);
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const p = inventoryCreateInput.safeParse(payload());
    if (!p.success) {
      setErrors(issueMap(p.error.issues));
      setFormError("Please fix the highlighted fields");
      return;
    }
    setErrors({});
    if (!current) {
      create.mutate(p.data, {
        onSuccess: (l) => {
          setCurrent(l as Listing);
          toast.success(`Saved as draft ${(l as Listing).inventoryId}. Now add photos.`);
        },
        onError: onServerError,
      });
    } else {
      const { category: _c, ...rest } = p.data;
      const patch = inventoryUpdateInput.parse(rest);
      update.mutate(
        { id: current.inventoryId, patch },
        {
          onSuccess: (l) => {
            const next = l as Listing;
            setCurrent(next);
            if (status === "approved" && next.status === "pending")
              toast.message("Saved. Location/price changes send the listing back to admin review.");
            else toast.success("Changes saved");
          },
          onError: onServerError,
        },
      );
    }
  }

  function addPhotos(list: FileList | null) {
    if (!current || !list?.length) return;
    const files = [...list];
    const big = files.find((x) => x.size > MAX_PHOTO_BYTES);
    if (big) return toast.error(`${big.name} is larger than 8 MB`);
    photos.mutate(
      { id: current.inventoryId, files },
      {
        onSuccess: (l) => {
          setCurrent(l as Listing);
          toast.success(`${files.length} photo${files.length > 1 ? "s" : ""} added`);
        },
        onError: (e) => toast.error(e.message),
        onSettled: () => {
          if (fileRef.current) fileRef.current.value = "";
        },
      },
    );
    return undefined;
  }

  function sendForReview() {
    if (!current) return;
    submit.mutate(current.inventoryId, {
      onSuccess: (l) => {
        setCurrent(l as Listing);
        toast.success("Submitted. OOHRENA will verify it before it goes live.");
        onClose();
      },
      onError: (e) => {
        const probs =
          e instanceof ApiError
            ? (e.details as { problems?: string[] } | undefined)?.problems
            : undefined;
        setFormError(probs?.length ? `Before submitting: ${probs.join("; ")}` : e.message);
      },
    });
  }

  const busy = create.isPending || update.isPending;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {current ? (
              <>
                Edit <span className="font-mono text-[13px] text-mute">{current.inventoryId}</span>{" "}
                <ListingPill status={current.status} />
              </>
            ) : (
              "New media listing"
            )}
          </DialogTitle>
        </DialogHeader>
        {current?.statusReason && (
          <p
            className={`text-[13px] ${current.status === "rejected" ? "text-destructive" : "text-hold"}`}
          >
            {current.status === "rejected" ? "Admin reason: " : ""}
            {current.statusReason}
          </p>
        )}
        {status === "pending" && (
          <p className="text-[13px] text-mute">
            This listing is under admin review and can't be changed until a decision is made.
          </p>
        )}
        {status === "approved" && (
          <p className="text-[12px] text-mute">
            Live listing. Changing location, address, rate, pricing unit or size sends it back to
            admin review.
          </p>
        )}
        <FormError message={formError} />

        <form onSubmit={save} noValidate>
          <fieldset disabled={!editable || busy} className="grid sm:grid-cols-2 gap-3 text-[13px]">
            <div className="space-y-1.5">
              <Label htmlFor="category" className="text-[13px]">
                Media category
              </Label>
              <select
                id="category"
                className={selectCls}
                value={f.category}
                disabled={!!current}
                onChange={(e) => pickCategory(e.target.value as CategoryId)}
              >
                {CATEGORY_DEFS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <Field
              id="title"
              label="Listing title"
              placeholder="e.g. Phoolbagh Chowk Unipole"
              value={f.title}
              error={errors["title"]}
              onChange={set("title")}
            />
            <Field
              id="city"
              label="City"
              value={f.city}
              error={errors["city"]}
              onChange={set("city")}
            />
            <Field
              id="locality"
              label="Locality / area"
              value={f.locality}
              error={errors["locality"]}
              onChange={set("locality")}
            />
            <Field
              id="address"
              label="Site address"
              className="sm:col-span-2"
              value={f.address}
              error={errors["address"]}
              onChange={set("address")}
            />
            <Field
              id="landmark"
              label="Nearest landmark (optional)"
              value={f.landmark}
              error={errors["landmark"]}
              onChange={set("landmark")}
            />
            <Field
              id="pin"
              label="PIN code"
              inputMode="numeric"
              value={f.pin}
              error={errors["pin"]}
              onChange={set("pin")}
            />
            <Field
              id="lat"
              label="Latitude"
              inputMode="decimal"
              value={f.lat}
              error={errors["lat"]}
              onChange={set("lat")}
            />
            <Field
              id="lng"
              label="Longitude"
              inputMode="decimal"
              value={f.lng}
              error={errors["lng"]}
              onChange={set("lng")}
            />
            <button
              type="button"
              onClick={useGps}
              className="sm:col-span-2 -mt-1 text-[12px] text-saffron-deep font-semibold flex items-center gap-1 w-fit"
            >
              <MapPin size={13} />
              Use this device's location (stand at the site)
            </button>

            <Field
              id="rate"
              label="Your rate (₹)"
              inputMode="decimal"
              hint="Private — shown only to OOHRENA"
              value={f.rate}
              error={errors["rate"]}
              onChange={set("rate")}
            />
            <div className="space-y-1.5">
              <Label htmlFor="pricingUnit" className="text-[13px]">
                Pricing unit
              </Label>
              <select
                id="pricingUnit"
                className={selectCls}
                value={f.pricingUnit}
                onChange={set("pricingUnit")}
              >
                {def.units.map((u) => (
                  <option key={u} value={u}>
                    {PRICING_UNIT_LABEL[u]}
                  </option>
                ))}
              </select>
              {errors["pricingUnit"] && (
                <p className="text-[12px] text-destructive">{errors["pricingUnit"]}</p>
              )}
            </div>
            <Field
              id="quantity"
              label="Quantity available"
              inputMode="numeric"
              value={f.quantity}
              error={errors["quantity"]}
              onChange={set("quantity")}
            />
            <div />

            <div className="sm:col-span-2 pt-2 text-[12px] uppercase tracking-wider text-mute font-semibold">
              {def.name} details
            </div>
            {def.attributes.map((a) =>
              a.type === "boolean" ? (
                <label key={a.key} className="flex items-center gap-2 h-11">
                  <input
                    type="checkbox"
                    checked={f.attributes[a.key] === true}
                    onChange={(e) =>
                      setF({ ...f, attributes: { ...f.attributes, [a.key]: e.target.checked } })
                    }
                  />
                  {a.label}
                </label>
              ) : (
                <Field
                  key={a.key}
                  id={`attr-${a.key}`}
                  label={`${a.label}${"unit" in a && a.unit ? ` (${a.unit})` : ""}${a.required ? "" : " (optional)"}`}
                  inputMode={a.type === "number" ? "decimal" : "text"}
                  value={String(f.attributes[a.key] ?? "")}
                  error={
                    errors[`attributes.${a.key}`] ??
                    (errors["attributes"] && a.required && !f.attributes[a.key]
                      ? errors["attributes"]
                      : undefined)
                  }
                  onChange={(e) =>
                    setF({ ...f, attributes: { ...f.attributes, [a.key]: e.target.value } })
                  }
                />
              ),
            )}

            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="description" className="text-[13px]">
                Description (optional)
              </Label>
              <Textarea
                id="description"
                rows={3}
                value={f.description}
                onChange={set("description")}
                placeholder="Visibility, traffic direction, lighting hours…"
              />
            </div>
          </fieldset>
          {editable && (
            <Btn type="submit" variant="dark" className="mt-4" disabled={busy}>
              {busy ? "Saving…" : current ? "Save changes" : "Save as draft"}
            </Btn>
          )}
        </form>

        {current && (
          <section className="border-t border-line pt-4 mt-2 space-y-3">
            <div className="flex items-center gap-3">
              <div className="font-semibold text-[14px] mr-auto">
                Site photos{" "}
                <span className="text-mute font-normal text-[12px]">
                  ({current.photos.length}/{MAX_PHOTOS_PER_LISTING} · JPG, PNG or WebP, max 8 MB)
                </span>
              </div>
              {(status === "draft" || status === "rejected" || status === "approved") &&
                current.photos.length < MAX_PHOTOS_PER_LISTING && (
                  <label className="h-9 px-3 rounded-lg border border-line bg-card text-[12px] font-semibold flex items-center gap-2 cursor-pointer">
                    <ImagePlus size={14} />
                    {photos.isPending ? "Uploading…" : "Add photos"}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(e) => addPhotos(e.target.files)}
                    />
                  </label>
                )}
            </div>
            {current.photos.length ? (
              <div className="flex flex-wrap gap-3">
                {current.photos.map((p) => (
                  <div key={p.fileId} className="relative">
                    <img
                      src={assetUrl(p.url)}
                      alt="Site"
                      className="h-24 w-36 object-cover rounded-md border border-line"
                    />
                    {(status === "draft" || status === "rejected") && (
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() =>
                          removePhoto.mutate(
                            { id: current.inventoryId, fileId: p.fileId },
                            {
                              onSuccess: (l) => setCurrent(l as Listing),
                              onError: (e) => toast.error(e.message),
                            },
                          )
                        }
                        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-navy text-navy-foreground grid place-items-center"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-mute">
                Add at least one clear daytime photo of the site. Listings without photos can't be
                submitted.
              </p>
            )}

            {(status === "draft" || status === "rejected") && (
              <div className="flex items-center gap-3 pt-2">
                <Btn onClick={sendForReview} disabled={submit.isPending || status === "rejected"}>
                  {submit.isPending ? "Submitting…" : "Submit for admin review"}
                </Btn>
                <span className="text-[12px] text-mute">
                  {status === "rejected"
                    ? "Save your corrections first — the listing returns to Draft."
                    : "After submitting you can't edit until OOHRENA decides."}
                </span>
              </div>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
