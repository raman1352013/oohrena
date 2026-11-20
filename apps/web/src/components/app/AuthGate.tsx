import { Link, Navigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ROLE_HOME, ROLE_LABEL, rolesFor, useSession } from "@/lib/auth";
import { Btn } from "@/components/app/kit";

/**
 * Shows a workspace only to the roles allowed on it. Signed-out visitors go to /login and
 * come back afterwards. This is UX only: every API endpoint enforces the same rules server-side.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });
  const session = useSession();
  const roles = rolesFor(path);

  if (!roles) return <>{children}</>;
  if (session.isPending) return <GateMessage title="Checking your session…" />;
  if (session.isError) {
    return (
      <GateMessage
        title="Can't reach the OOHRENA server"
        body="We couldn't confirm your sign-in. Check your connection and try again."
      >
        <Btn onClick={() => void session.refetch()}>Try again</Btn>
      </GateMessage>
    );
  }
  const user = session.data;
  if (!user) return <Navigate to="/login" search={{ redirect: href }} replace />;
  if (!roles.includes(user.role)) {
    return (
      <GateMessage
        title="This workspace isn't available to your account"
        body={`You're signed in as ${ROLE_LABEL[user.role]}. Ask an OOHRENA admin if you need different access.`}
      >
        <Link to={ROLE_HOME[user.role]}>
          <Btn>Go to my workspace</Btn>
        </Link>
      </GateMessage>
    );
  }
  return <>{children}</>;
}

function GateMessage({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <main className="px-4 py-24 flex justify-center">
      <div className="max-w-md text-center">
        <h1 className="text-[18px] font-semibold text-ink">{title}</h1>
        {body && <p className="text-[13px] text-mute mt-2">{body}</p>}
        {children && <div className="mt-6 flex justify-center">{children}</div>}
      </div>
    </main>
  );
}
