import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PinLogo } from "@/components/app/kit";
import { cn } from "@/lib/utils";

export function AuthShell({ title, sub, children, footer, wide }: { title: string; sub: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-[calc(100vh-3.5rem)] px-4 py-10 md:py-16 flex justify-center">
      <div className={cn("w-full", wide ? "max-w-xl" : "max-w-md")}>
        <div className="flex items-center gap-3 mb-6">
          <PinLogo size={36} />
          <div>
            <div className="font-bold tracking-wide text-ink">OOHRENA</div>
            <div className="text-[12px] text-mute">Outdoor x Digital x Trackable</div>
          </div>
        </div>
        <section className="bg-card border border-line rounded-xl p-6 md:p-8">
          <h1 className="text-[20px] font-semibold text-ink">{title}</h1>
          <p className="text-[13px] text-mute mt-1 mb-6">{sub}</p>
          {children}
        </section>
        {footer && <div className="text-[13px] text-mute text-center mt-5">{footer}</div>}
      </div>
    </main>
  );
}

export function Field({
  id, label, error, hint, className, ...input
}: React.InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; error?: string | undefined; hint?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[13px] text-ink">{label}</Label>
      <Input id={id} name={id} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined} className={cn("h-11 bg-card", error && "border-destructive")} {...input} />
      {error ? <p id={`${id}-err`} className="text-[12px] text-destructive">{error}</p> : hint ? <p id={`${id}-hint`} className="text-[12px] text-mute">{hint}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-[13px] px-3 py-2.5 mb-4">{message}</div>;
}
