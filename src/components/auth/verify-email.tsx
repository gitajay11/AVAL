"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleCheck, CircleX } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { api, ClientApiError } from "@/lib/client/api";
import { once, useHashToken } from "@/lib/client/use-hash-token";
import { AuthCard } from "./auth-card";

type State = { status: "working" } | { status: "done" } | { status: "failed"; message: string };

export function VerifyEmail() {
  const token = useHashToken();
  const [state, setState] = useState<State>({ status: "working" });

  useEffect(() => {
    if (token === undefined) return;
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from the URL once
      setState({ status: "failed", message: "This link is incomplete." });
      return;
    }
    once(`verify:${token}`, () => api("/api/auth/verify-email", { body: { token } }))
      .then(() => setState({ status: "done" }))
      .catch((err) =>
        setState({ status: "failed", message: err instanceof ClientApiError ? err.message : "Verification failed." }),
      );
  }, [token]);

  const footer = (
    <Link href="/chats" className="font-semibold text-accent hover:underline">
      Go to Aval
    </Link>
  );

  if (state.status === "working") {
    return (
      <AuthCard title="Verifying your email…">
        <div className="flex justify-center py-6 text-accent">
          <Spinner className="size-8" />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={state.status === "done" ? "Email verified" : "Couldn't verify"}
      subtitle={
        state.status === "done"
          ? "You're all set."
          : `${state.message} Sign in and use “Resend email” to get a new link.`
      }
      footer={footer}
    >
      <div className="flex justify-center py-2">
        {state.status === "done" ? (
          <CircleCheck className="size-14 text-accent" aria-hidden="true" />
        ) : (
          <CircleX className="size-14 text-danger" aria-hidden="true" />
        )}
      </div>
    </AuthCard>
  );
}
