import type { Metadata } from "next";
import { VerifyEmail } from "@/components/auth/verify-email";

export const metadata: Metadata = { title: "Verify email" };

export default function Page() {
  return <VerifyEmail />;
}
