import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { actions, type Site } from "@/lib/store";
import { Btn } from "./kit";

export function RequestQuoteDialog({ site, months, open, onOpenChange, source = "marketplace" }: { site?: Site | undefined; months: number; open: boolean; onOpenChange: (v: boolean) => void; source?: "marketplace" | "partner" }) {
  const [done, setDone] = useState<string>();
  const [f, setF] = useState({ client: "", contact: "", phone: "", email: "", startDate: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), budget: "", note: "" });
  const [err, setErr] = useState<string>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!site) return;
    if (f.client.trim().length < 2 || f.contact.trim().length < 2) return setErr("Enter your company and contact name.");
    if (!/^[+\d\s-]{10,15}$/.test(f.phone.trim())) return setErr("Enter a valid mobile number.");
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErr("Enter a valid email address.");
    setErr(undefined);
    const id = actions.requestQuote({
      client: f.client.trim(), contact: f.contact.trim(), phone: f.phone.trim(), email: f.email.trim(), city: site.city, corridor: site.corridor,
      media: `${site.category.split("/")[0]} ${site.size}`, siteId: site.id, budget: Number(f.budget) || site.monthlyRate * months,
      durationDays: months * 30, startDate: f.startDate, source, partner: source === "partner", note: f.note.trim() || undefined,
    });
    setDone(id);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setDone(undefined); }}>
      <DialogContent className="max-w-lg">
        {done ? (
          <div className="text-center py-4">
            <CheckCircle2 className="mx-auto text-verified" size={40} />
            <h3 className="text-lg font-semibold mt-3">Quotation requested</h3>
            <p className="text-[13px] text-mute mt-2">Your reference is <b className="font-mono text-ink">{done}</b>. Our operations team reviews every inquiry and sends an itemized GST quote within 2 hours.</p>
            <div className="flex justify-center gap-2 mt-5"><Btn variant="secondary" onClick={() => onOpenChange(false)}>Keep browsing</Btn><Link to="/client"><Btn>Go to Client Portal</Btn></Link></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <DialogHeader><DialogTitle>Request Quotation</DialogTitle><DialogDescription>{site?.name} · {site?.city} · {months} month{months > 1 ? "s" : ""}</DialogDescription></DialogHeader>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input placeholder="Company / Brand" value={f.client} onChange={set("client")} />
              <Input placeholder="Contact name" value={f.contact} onChange={set("contact")} />
              <Input placeholder="Mobile number" value={f.phone} onChange={set("phone")} />
              <Input placeholder="Work email" value={f.email} onChange={set("email")} />
              <label className="text-[11px] text-mute">Campaign start<Input type="date" value={f.startDate} onChange={set("startDate")} /></label>
              <label className="text-[11px] text-mute">Budget (₹, optional)<Input type="number" value={f.budget} onChange={set("budget")} /></label>
            </div>
            <Textarea placeholder="Creative or targeting notes (optional)" value={f.note} onChange={set("note")} />
            {err && <p className="text-[12px] text-destructive">{err}</p>}
            <Btn type="submit" className="w-full">Submit for Admin review</Btn>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
