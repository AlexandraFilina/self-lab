import assert from "node:assert/strict";
import { test } from "node:test";
import { localAuthMailAvailable } from "../../src/server/auth/mail";
import { getAuth } from "../../src/server/auth";
import { getDatabase, openDatabase } from "../../src/server/db/client";
import { AppError } from "../../src/lib/errors";

test("Mailpit is available only for a local auth origin outside Vercel", () => {
  const original = {
    baseURL: process.env.BETTER_AUTH_URL,
    smtpHost: process.env.SMTP_HOST,
    vercel: process.env.VERCEL,
  };
  try {
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    process.env.SMTP_HOST = "127.0.0.1";
    delete process.env.VERCEL;
    assert.equal(localAuthMailAvailable(), true);

    process.env.BETTER_AUTH_URL = "https://self-lab.vercel.app";
    assert.equal(localAuthMailAvailable(), false);

    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    process.env.SMTP_HOST = "smtp.example.com";
    assert.equal(localAuthMailAvailable(), false);

    process.env.SMTP_HOST = "127.0.0.1";
    process.env.VERCEL = "1";
    assert.equal(localAuthMailAvailable(), false);
  } finally {
    for (const [key, value] of Object.entries({
      BETTER_AUTH_URL: original.baseURL,
      SMTP_HOST: original.smtpHost,
      VERCEL: original.vercel,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("production configuration rejects localhost auth and unverified database TLS", () => {
  const keys = ["VERCEL_ENV", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET", "DATABASE_URL"] as const;
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.VERCEL_ENV = "production";
    process.env.BETTER_AUTH_SECRET = "a".repeat(32);
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    assert.throws(
      () => getAuth(),
      (error) => error instanceof AppError,
    );
    process.env.BETTER_AUTH_URL = "https://self-lab.example";
    process.env.DATABASE_URL = "postgresql://user:password@localhost/database?sslmode=verify-full";
    assert.throws(
      () => getDatabase(),
      (error) => error instanceof AppError,
    );
    process.env.DATABASE_URL = "postgresql://user:password@db.example/database?sslmode=disable";
    assert.throws(
      () => getDatabase(),
      (error) => error instanceof AppError,
    );
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});

test("Vercel pool omits startup parameters unsupported by transaction pooling", async () => {
  const { pool } = openDatabase("postgresql://test:test@127.0.0.1:5599/test", true);
  try {
    assert.equal(pool.options.max, 2);
    assert.equal(pool.options.statement_timeout, undefined);
    assert.equal(pool.options.options, undefined);
  } finally {
    await pool.end();
  }
});
