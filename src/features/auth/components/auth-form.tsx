"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Card, Input } from "@/components/ui";
import { Icon } from "@/components/icon";
import { t } from "@/i18n";
import { useClientReady } from "../use-client-ready";
import { authClient } from "../client";
import { emailSchema, resetPasswordSchema, signInSchema, signUpSchema } from "../model/schemas";
import { errorMessage } from "@/lib/errors";
export type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password";
export function AuthForm({ mode }: { mode: AuthMode }) {
  const ready = useClientReady();
  const params = useSearchParams();
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const signUp = mode === "sign-up",
    reset = mode === "reset-password",
    forgot = mode === "forgot-password";
  const title = signUp
    ? t.auth.signUp
    : forgot
      ? t.auth.forgotTitle
      : reset
        ? t.auth.resetTitle
        : t.auth.signIn;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setError("");
    try {
      const fields = {
        email: data.get("email"),
        password: data.get("password"),
        confirmPassword: data.get("confirmPassword"),
      };
      setPending(true);
      let result;
      if (signUp) {
        const values = signUpSchema.parse(fields);
        result = await authClient.signUp.email({
          email: values.email,
          password: values.password,
          name: t.auth.defaultName,
          callbackURL: "/account",
        });
      } else if (forgot) {
        result = await authClient.requestPasswordReset({
          email: emailSchema.parse(fields.email),
          redirectTo: "/reset-password",
        });
      } else if (reset) {
        const values = resetPasswordSchema.parse(fields);
        const token = params.get("token");
        if (!token || params.has("error")) {
          setError(t.auth.resetError);
          return;
        }
        result = await authClient.resetPassword({ newPassword: values.password, token });
      } else {
        const values = signInSchema.parse(fields);
        result = await authClient.signIn.email({ ...values, rememberMe: true });
      }
      if (result.error) {
        setError(
          result.error.status === 429
            ? t.auth.rateLimited
            : result.error.status >= 500
              ? t.auth.serviceError
              : signUp
                ? t.auth.signUpError
                : reset
                  ? t.auth.resetError
                  : forgot
                    ? t.auth.serviceError
                    : t.auth.signInError,
        );
        return;
      }
      if (forgot || reset) setDone(true);
      else window.location.assign(new URL("/dashboard", window.location.origin).href);
    } catch (cause) {
      setError(cause instanceof TypeError ? t.auth.serviceError : errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-page">
      <Link href="/dashboard" className="brand auth-brand">
        <span className="brand-symbol">
          <Icon name="flask" />
        </span>
        <span>
          {t.shell.brandMain}
          <span className="brand-subtitle">{t.shell.brandSub}</span>
        </span>
      </Link>
      <Card className="auth-card">
        <h1>{title}</h1>
        <p className="muted">
          {signUp
            ? t.auth.signUpCopy
            : forgot
              ? t.auth.forgotCopy
              : reset
                ? t.auth.resetCopy
                : t.auth.signInCopy}
        </p>
        {done ? (
          <div className="auth-result">
            <p role="status">{forgot ? t.auth.resetSent : t.auth.resetDone}</p>
            <Link href="/sign-in">{t.auth.backToSignIn}</Link>
          </div>
        ) : (
          <form method="post" noValidate onSubmit={submit} data-ready={ready}>
            {!reset && (
              <div className="form-field">
                <label htmlFor="auth-email" className="field-label">
                  {t.auth.email}
                </label>
                <Input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  disabled={!ready || pending}
                />
              </div>
            )}
            {!forgot && (
              <div className="form-field">
                <label htmlFor="auth-password" className="field-label">
                  {t.auth.password}
                </label>
                <Input
                  id="auth-password"
                  name="password"
                  type="password"
                  autoComplete={signUp || reset ? "new-password" : "current-password"}
                  required
                  minLength={signUp || reset ? 12 : undefined}
                  maxLength={128}
                  disabled={!ready || pending}
                  aria-describedby={signUp || reset ? "password-help" : undefined}
                />
              </div>
            )}
            {(signUp || reset) && (
              <>
                <p id="password-help" className="field-hint">
                  {t.auth.passwordHelp}
                </p>
                <div className="form-field">
                  <label htmlFor="auth-confirm" className="field-label">
                    {t.auth.confirmPassword}
                  </label>
                  <Input
                    id="auth-confirm"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    maxLength={128}
                    disabled={!ready || pending}
                  />
                </div>
              </>
            )}
            {(error || (reset && (!params.get("token") || params.has("error")))) && (
              <p className="form-error" role="alert">
                {error || t.auth.resetError}
              </p>
            )}
            {!reset && params.has("error") && (
              <p className="form-error" role="alert">
                {t.auth.verificationError}
              </p>
            )}
            <Button type="submit" disabled={!ready || pending}>
              {pending
                ? signUp
                  ? t.auth.signingUp
                  : forgot
                    ? t.auth.sending
                    : reset
                      ? t.auth.saving
                      : t.auth.signingIn
                : signUp
                  ? t.auth.signUp
                  : forgot
                    ? t.auth.sendReset
                    : reset
                      ? t.auth.savePassword
                      : t.auth.signIn}
            </Button>
          </form>
        )}
        {!done && (
          <div className="auth-links">
            {mode === "sign-in" ? (
              <>
                <Link href="/forgot-password">{t.auth.forgot}</Link>
                <Link href="/sign-up">{t.auth.createAccount}</Link>
              </>
            ) : (
              <Link href="/sign-in">{t.auth.backToSignIn}</Link>
            )}
          </div>
        )}
      </Card>
      <p className="muted auth-caption">{t.shell.caption}</p>
    </div>
  );
}
