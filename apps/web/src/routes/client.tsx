import { createFileRoute } from "@tanstack/react-router";
import { ClientHeading, MyInquiries } from "@/components/app/client/MyInquiries";
import { MyBookings, MyQuotations } from "@/components/app/client/QuotesBookings";
import { ClientPayments } from "@/components/app/FinanceCards";
import { ClientProfileCard } from "@/components/app/client/ClientProfileCard";

export const Route = createFileRoute("/client")({
  head: () => ({
    meta: [
      { title: "Client Portal — OOHRENA" },
      {
        name: "description",
        content: "Your inquiries, quotations, bookings and verified proof of display.",
      },
      { property: "og:title", content: "Client Portal — OOHRENA" },
      {
        property: "og:description",
        content: "Track every campaign with verified proof of display.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientPortal,
});

/** Everything here is the signed-in client's own data from the API. */
function ClientPortal() {
  return (
    <div className="max-w-[1216px] mx-auto px-4 md:px-8 py-6 space-y-5">
      <ClientHeading />
      <ClientProfileCard />
      <MyInquiries />
      <MyQuotations />
      <MyBookings />
      <ClientPayments />
    </div>
  );
}
