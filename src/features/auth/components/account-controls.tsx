"use client";
import { useState } from "react";
import Link from "next/link";
import { t } from "@/i18n";
import { Button, Card } from "@/components/ui";
import { useClientReady } from "../use-client-ready";
import { authClient } from "../client";
export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const ready = useClientReady();
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <span className="account-sign-out">
      <Button
        variant="ghost"
        disabled={!ready || pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const result = await authClient.signOut();
            if (result.error) throw new Error("Sign out failed");
            window.location.replace("/sign-in");
          } catch {
            setError(t.auth.serviceError);
            setPending(false);
          }
        }}
      >
        {pending ? t.auth.signingOut : t.auth.signOut}
      </Button>
      {error && (
        <span className="form-error" role="alert">
          {compact ? t.auth.accountUnavailable : error}
        </span>
      )}
    </span>
  );
}
export function AccountControls({
  email,
  emailVerified,
  mailAvailable,
}: {
  email: string;
  emailVerified: boolean;
  mailAvailable: boolean;
}) {
  const ready = useClientReady();
  const [pending, setPending] = useState(false),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState("");
  return (
    <Card className="form-card account-card">
      <h1>{t.auth.account}</h1>
      <p className="muted">{t.auth.accountCopy}</p>
      <dl>
        <dt>{t.auth.email}</dt>
        <dd>{email}</dd>
      </dl>
      <p>{emailVerified ? t.auth.verified : t.auth.unverified}</p>
      {!emailVerified && (
        <>
          <p className="field-hint">{mailAvailable ? t.auth.verifyHelp : t.auth.mailUnavailable}</p>
          {mailAvailable && (
            <Button
              variant="secondary"
              disabled={!ready || pending}
              onClick={async () => {
                setPending(true);
                setError("");
                setFeedback("");
                try {
                  const result = await authClient.sendVerificationEmail({
                    email,
                    callbackURL: "/account",
                  });
                  if (result.error) throw new Error("Verification failed");
                  setFeedback(t.auth.verificationSent);
                } catch {
                  setError(t.auth.serviceError);
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? t.auth.sending : t.auth.resendVerification}
            </Button>
          )}
        </>
      )}
      {feedback && <p role="status">{feedback}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {mailAvailable && (
        <div className="auth-links">
          <Link href="/forgot-password">{t.auth.forgot}</Link>
        </div>
      )}
      <SignOutButton />
    </Card>
  );
}
