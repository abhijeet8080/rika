import { SignUp } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/auth-shell";

export default function Page() {
  return (
    <AuthShell>
      <SignUp path="/sign-up" signInUrl="/sign-in" />
    </AuthShell>
  );
}
