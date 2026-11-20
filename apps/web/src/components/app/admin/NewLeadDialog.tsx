import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { adminLeadCreateInput } from "@oohrena/shared";
import { api, ApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Btn } from "@/components/app/kit";
import { Field, FormError } from "@/components/app/AuthShell";
import { selectCls } from "@/lib/format";

const plus = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Admin logs an inquiry that arrived by phone, WhatsApp, partner or agency — it gets a Lead ID like any web inquiry. */
export function NewLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const create = useMutation({ mutationFn: (b: unknown) => api<{ leadId: string }>("/admin/leads", { body: b }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }) });
  const [f, setF] = useState({ source: "phone", name: "", company: "", mobile: "", email: "", city: "", inventoryIds: "", from: plus(14), to: plus(43), budget: "", requirement: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const p = adminLeadCreateInput.safeParse({
      source: f.source, contact: { name: f.name, mobile: f.mobile.replace(/\s/g, ""), ...(f.company ? { company: f.company } : {}), ...(f.email ? { email: f.email } : {}) },
      inventoryIds: f.inventoryIds.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean), ...(f.city ? { city: f.city } : {}),
      from: f.from, to: f.to, ...(f.budget ? { budget: f.budget } : {}), requirement: f.requirement,
    });
    if (!p.success) { setErrors(Object.fromEntries(p.error.issues.map((i) => [i.path.join("."), i.message]))); return; }
    setErrors({});
    create.mutate(p.data, {
      onSuccess: (r) => { toast.success(`Logged ${r.leadId}`); onClose(); void nav({ to: "/admin/leads/$leadId", params: { leadId: r.leadId } }); },
      onError: (err) => setFormError(err instanceof ApiError ? err.message : String(err)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Log an inquiry</DialogTitle></DialogHeader>
        <FormError message={formError} />
        <form onSubmit={submit} noValidate className="grid sm:grid-cols-2 gap-3 text-[13px]">
          <div className="space-y-1.5"><label htmlFor="src" className="font-medium">Source</label>
            <select id="src" className={selectCls} value={f.source} onChange={set("source")}>{[["phone", "Phone"], ["whatsapp", "WhatsApp"], ["growth_partner", "Growth Partner"], ["agency", "Agency"], ["other", "Other"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <Field id="cname" label="Contact name" value={f.name} error={errors["contact.name"]} onChange={set("name")} />
          <Field id="ccomp" label="Company (optional)" value={f.company} onChange={set("company")} />
          <Field id="cmob" label="Mobile" type="tel" value={f.mobile} error={errors["contact.mobile"]} onChange={set("mobile")} />
          <Field id="cmail" label="Email (optional)" type="email" value={f.email} error={errors["contact.email"]} onChange={set("email")} />
          <Field id="ccity" label="City" value={f.city} onChange={set("city")} />
          <Field id="cinv" label="Inventory IDs (optional)" className="sm:col-span-2" placeholder="INV-HRD-000001, INV-LED-000002" value={f.inventoryIds} onChange={set("inventoryIds")} />
          <Field id="cfrom" label="From" type="date" value={f.from} error={errors["from"]} onChange={set("from")} />
          <Field id="cto" label="To" type="date" value={f.to} error={errors["to"]} onChange={set("to")} />
          <Field id="cbud" label="Budget ₹ (optional)" inputMode="numeric" value={f.budget} onChange={set("budget")} />
          <div className="sm:col-span-2 space-y-1.5"><label htmlFor="creq" className="font-medium">Requirement</label>
            <Textarea id="creq" rows={3} value={f.requirement} onChange={set("requirement")} />
            {errors["requirement"] && <p className="text-[12px] text-destructive">{errors["requirement"]}</p>}</div>
          <Btn type="submit" className="sm:col-span-2" disabled={create.isPending}>{create.isPending ? "Saving…" : "Create lead"}</Btn>
        </form>
      </DialogContent>
    </Dialog>
  );
}
