import { SignIn } from "@clerk/nextjs";
import { AuthShell } from "@/components/auth/auth-shell";

export default function Page() {
  return (
    <AuthShell>
      <SignIn path="/sign-in" signUpUrl="/sign-up" />
    </AuthShell>
  );
}
