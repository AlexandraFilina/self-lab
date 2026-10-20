import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emailSchema,
  signUpSchema,
  signInSchema,
  resetPasswordSchema,
} from "../src/features/auth/model/schemas";
test("auth email normalization and validation are shared between UI and server", () => {
  assert.equal(emailSchema.parse("  PERSON@Example.COM  "), "person@example.com");
  for (const email of ["", "invalid", "a@"])
    assert.equal(emailSchema.safeParse(email).success, false);
});
test("registration requires a bounded password and matching confirmation without trimming passwords", () => {
  const valid = {
    email: "person@example.com",
    password: "a long passphrase",
    confirmPassword: "a long passphrase",
  };
  assert.ok(signUpSchema.safeParse(valid).success);
  assert.equal(
    signUpSchema.safeParse({ ...valid, password: "short", confirmPassword: "short" }).success,
    false,
  );
  assert.equal(signUpSchema.safeParse({ ...valid, confirmPassword: "different" }).success, false);
  assert.equal(
    signUpSchema.safeParse({
      ...valid,
      password: "x".repeat(129),
      confirmPassword: "x".repeat(129),
    }).success,
    false,
  );
  assert.equal(
    signInSchema.parse({ email: valid.email, password: "  keep spaces  " }).password,
    "  keep spaces  ",
  );
});
test("reset validates both new password fields and signin accepts legacy-length passwords", () => {
  assert.equal(
    resetPasswordSchema.safeParse({ password: "a long passphrase", confirmPassword: "other" })
      .success,
    false,
  );
  assert.equal(
    signInSchema.safeParse({ email: "a@example.com", password: "legacy" }).success,
    true,
  );
});
