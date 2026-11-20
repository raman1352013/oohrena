import { useState, useEffect } from "react";
import { Btn, KCard } from "@/components/app/kit";
import { useClientProfile, useUpdateClientProfile } from "@/lib/deals-api";

export function ClientProfileCard() {
  const { data: profile, isLoading } = useClientProfile();
  const updateProfile = useUpdateClientProfile();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    gstin: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    pin: "",
    contactName: "",
    contactEmail: "",
    contactMobile: "",
    contactDesignation: "",
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setForm({
        companyName: profile.companyName || "",
        gstin: profile.gstin || "",
        line1: profile.billingAddress?.line1 || "",
        line2: profile.billingAddress?.line2 || "",
        city: profile.billingAddress?.city || "",
        state: profile.billingAddress?.state || "",
        pin: profile.billingAddress?.pin || "",
        contactName: profile.contacts?.[0]?.name || "",
        contactEmail: profile.contacts?.[0]?.email || "",
        contactMobile: profile.contacts?.[0]?.mobile || "",
        contactDesignation: profile.contacts?.[0]?.designation || "",
      });
    }
  }, [profile]);

  if (isLoading) {
    return <div className="p-4 text-center text-mute text-[13px]">Loading company profile...</div>;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await updateProfile.mutateAsync({
        companyName: form.companyName,
        gstin: form.gstin || null,
        billingAddress: form.line1
          ? {
              line1: form.line1,
              line2: form.line2 || undefined,
              city: form.city,
              state: form.state,
              pin: form.pin,
            }
          : (null as never),
        contacts: form.contactName
          ? [
              {
                name: form.contactName,
                email: form.contactEmail || undefined,
                mobile: form.contactMobile || undefined,
                designation: form.contactDesignation || undefined,
              },
            ]
          : [],
      });
      setSuccessMsg("Company billing profile updated successfully.");
      setEditing(false);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update profile");
    }
  };

  return (
    <KCard
      title="Company & Billing Profile"
      right={
        !editing ? (
          <Btn size="sm" tone="secondary" onClick={() => setEditing(true)}>
            Edit Profile
          </Btn>
        ) : (
          <Btn size="sm" tone="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Btn>
        )
      }
    >
      <div className="p-5">
        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-50 text-emerald-800 text-[13px] rounded-lg border border-emerald-200">
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-800 text-[13px] rounded-lg border border-red-200">
            {errorMsg}
          </div>
        )}

        {editing ? (
          <form onSubmit={handleSave} className="space-y-4 text-[13px]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-medium text-mute mb-1">
                  Company Legal Name *
                </label>
                <input
                  required
                  type="text"
                  value={form.companyName}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                  className="w-full h-9 rounded-lg border border-line bg-card px-3"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-mute mb-1">
                  GSTIN (15-digit)
                </label>
                <input
                  type="text"
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  placeholder="23AAAAA0000A1Z5"
                  className="w-full h-9 rounded-lg border border-line bg-card px-3 font-mono"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-line">
              <h3 className="font-semibold text-[13px] mb-2">
                Billing Address (Feeds Tax Invoices)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[12px] font-medium text-mute mb-1">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    value={form.line1}
                    onChange={(e) => setForm({ ...form, line1: e.target.value })}
                    placeholder="Street, Building, Floor"
                    className="w-full h-9 rounded-lg border border-line bg-card px-3"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-mute mb-1">City</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full h-9 rounded-lg border border-line bg-card px-3"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-mute mb-1">State</label>
                  <input
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full h-9 rounded-lg border border-line bg-card px-3"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-mute mb-1">
                    PIN Code (6 digits)
                  </label>
                  <input
                    type="text"
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value })}
                    placeholder="400001"
                    className="w-full h-9 rounded-lg border border-line bg-card px-3 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-line">
              <h3 className="font-semibold text-[13px] mb-2">Primary Billing Contact</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-mute mb-1">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={form.contactName}
                    onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    className="w-full h-9 rounded-lg border border-line bg-card px-3"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-mute mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                    className="w-full h-9 rounded-lg border border-line bg-card px-3"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-mute mb-1">
                    Contact Mobile
                  </label>
                  <input
                    type="text"
                    value={form.contactMobile}
                    onChange={(e) => setForm({ ...form, contactMobile: e.target.value })}
                    className="w-full h-9 rounded-lg border border-line bg-card px-3"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <Btn type="button" tone="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Btn>
              <Btn type="submit" tone="primary" disabled={updateProfile.isPending}>
                {updateProfile.isPending ? "Saving..." : "Save Profile"}
              </Btn>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[13px]">
            <div>
              <div className="text-[12px] text-mute">Company Details</div>
              <div className="font-bold text-base mt-1">{profile?.companyName}</div>
              <div className="text-mute font-mono text-[12px] mt-0.5">
                GSTIN: {profile?.gstin || "Not provided (unregistered)"}
              </div>
              <div className="text-mute font-mono text-[11px] mt-1">ID: {profile?.clientId}</div>
            </div>

            <div>
              <div className="text-[12px] text-mute">Billing Address</div>
              {profile?.billingAddress?.line1 ? (
                <div className="mt-1 leading-relaxed">
                  <div>{profile.billingAddress.line1}</div>
                  {profile.billingAddress.line2 && <div>{profile.billingAddress.line2}</div>}
                  <div>
                    {profile.billingAddress.city}, {profile.billingAddress.state} -{" "}
                    {profile.billingAddress.pin}
                  </div>
                </div>
              ) : (
                <div className="text-mute italic mt-1">No billing address set</div>
              )}
            </div>

            <div>
              <div className="text-[12px] text-mute">Billing Contact</div>
              {profile?.contacts?.[0] ? (
                <div className="mt-1">
                  <div className="font-semibold">{profile.contacts[0].name}</div>
                  {profile.contacts[0].designation && (
                    <div className="text-[12px] text-mute">{profile.contacts[0].designation}</div>
                  )}
                  {profile.contacts[0].email && (
                    <div className="text-[12px]">{profile.contacts[0].email}</div>
                  )}
                  {profile.contacts[0].mobile && (
                    <div className="text-[12px]">{profile.contacts[0].mobile}</div>
                  )}
                </div>
              ) : (
                <div className="text-mute italic mt-1">No contacts listed</div>
              )}
            </div>
          </div>
        )}
      </div>
    </KCard>
  );
}
