// Themes Clerk widgets to match the white and teal workspace palette.
// The variables mirror the shared tokens in app/globals.css.
// Untyped (no `Appearance` type is re-exported from @clerk/nextjs) — the
// SignIn/SignUp `appearance` prop structurally accepts this shape.
export const clerkAppearance = {
  variables: {
    colorPrimary: "#124e49",
    colorBackground: "#ffffff",
    colorInputBackground: "#ffffff",
    colorInputText: "#124e49",
    colorText: "#124e49",
    colorTextSecondary: "#63766e",
    colorDanger: "#ff3b2f",
    colorNeutral: "#63766e",
    borderRadius: "0.75rem",
    fontFamily: "var(--font-geist-sans)",
  },
  elements: {
    card: "shadow-none border border-line",
    headerTitle: "font-[family-name:var(--font-display)]",
    formButtonPrimary:
      "bg-ink hover:bg-ink/85 text-paper normal-case shadow-none",
    footerActionLink: "text-ink hover:text-ink/80",
    formFieldInput: "border-line focus:border-ink/30",
    dividerLine: "bg-line",
    socialButtonsBlockButton: "border-line hover:bg-paper-soft",
  },
};
