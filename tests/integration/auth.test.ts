import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createAuth } from "../../src/server/auth/config";
import { authenticatedRepository } from "../../src/server/auth/authorized-repository";
import { openDatabase } from "../../src/server/db/client";
import {
  authUsers,
  authSessions,
  authVerifications,
  workspaces,
  experiments,
  localImports,
} from "../../src/server/db/schema";
import type { AuthMail } from "../../src/server/auth/mail";
import { testDatabaseUrl } from "../../scripts/env";
import { builtInMetric } from "../../src/features/experiments/model/metrics";
import { buildCustomMetric, buildExperiment } from "../../src/features/experiments/model/actions";
import { AppError } from "../../src/lib/errors";

const coded = (code: string) => (error: unknown) =>
  error instanceof AppError && error.code === code;
test("real PostgreSQL authentication, sessions, reset, verification and user isolation", async (t) => {
  const { db, pool } = openDatabase(testDatabaseUrl());
  await migrate(db, { migrationsFolder: "drizzle" });
  const mail: AuthMail[] = [],
    ids: string[] = [];
  const base = "http://localhost:3999";
  const auth = createAuth(db, {
    baseURL: base,
    secret: randomBytes(32).toString("hex"),
    sendMail: async (message) => {
      mail.push(message);
    },
  });
  const ip = "198.18." + Math.floor(Math.random() * 240) + "." + Math.floor(Math.random() * 240);
  async function post(path: string, body: unknown, cookie = "") {
    return auth.handler(
      new Request(base + "/api/auth/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: base,
          Cookie: cookie,
          "x-forwarded-for": ip,
        },
        body: JSON.stringify(body),
      }),
    );
  }
  const password = "A long private passphrase!";
  const emailA = `a-${randomUUID()}@self-lab.test`,
    emailB = `b-${randomUUID()}@self-lab.test`;
  function cookies(response: Response) {
    return response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  }
  async function signUp(email: string) {
    const response = await post("sign-up/email", {
      email,
      password,
      name: "Not a required UI field",
      callbackURL: "/account",
    });
    assert.equal(response.status, 200);
    const result = (await response.json()) as { user: { id: string; email: string } };
    ids.push(result.user.id);
    return { ...result, cookie: cookies(response), response };
  }
  t.after(async () => {
    if (ids.length) {
      const owned = await db.select().from(workspaces).where(inArray(workspaces.ownerUserId, ids));
      const workspaceIds = owned.map((row) => row.id);
      if (workspaceIds.length) {
        await db.delete(experiments).where(inArray(experiments.workspaceId, workspaceIds));
        await db.delete(localImports).where(inArray(localImports.workspaceId, workspaceIds));
        await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
      }
      await db.delete(authVerifications).where(inArray(authVerifications.value, ids));
      await db.delete(authUsers).where(inArray(authUsers.id, ids));
    }
    await pool.end();
  });
  const a = await signUp(emailA.toUpperCase()),
    b = await signUp(emailB);
  const repoA = await authenticatedRepository(new Headers({ cookie: a.cookie }), auth, db);
  const repoB = await authenticatedRepository(new Headers({ cookie: b.cookie }), auth, db);
  const draft = {
    title: "Private A",
    question: "What do I observe?",
    habit: "Read before bed",
    durationDays: 14,
    metrics: [builtInMetric("mood"), buildCustomMetric("Focus", randomUUID())],
  };
  const id = randomUUID();
  await t.test(
    "registration creates distinct owned personal workspaces without claiming development data",
    async () => {
      const owned = await db.select().from(workspaces).where(inArray(workspaces.ownerUserId, ids));
      assert.equal(owned.length, 2);
      assert.ok(owned.every((row) => row.isPersonal));
      assert.notEqual(owned[0].id, owned[1].id);
      assert.ok(owned.every((row) => row.id !== "00000000-0000-4000-8000-000000000001"));
      assert.equal(a.user.email, emailA);
      assert.ok(
        a.response.headers
          .getSetCookie()
          .some((value) => /HttpOnly/i.test(value) && /SameSite=Lax/i.test(value)),
      );
    },
  );
  await t.test(
    "duplicate normalized email fails without another account or workspace",
    async () => {
      const response = await post("sign-up/email", { email: emailA, password, name: "Duplicate" });
      assert.ok(response.status >= 400);
      assert.equal(ids.length, 2);
      assert.equal(
        (await db.select().from(workspaces).where(eq(workspaces.ownerUserId, a.user.id))).length,
        1,
      );
    },
  );
  await t.test("valid login returns a session; invalid credentials do not", async () => {
    assert.equal(
      (await post("sign-in/email", { email: emailA, password: "wrong password" })).status,
      401,
    );
    assert.equal(
      (await post("sign-in/email", { email: `missing-${randomUUID()}@self-lab.test`, password }))
        .status,
      401,
    );
    const response = await post("sign-in/email", { email: emailA, password });
    assert.equal(response.status, 200);
    assert.ok(await auth.api.getSession({ headers: new Headers({ cookie: cookies(response) }) }));
  });
  await t.test("anonymous, forged, and expired sessions cannot obtain a repository", async () => {
    await assert.rejects(authenticatedRepository(new Headers(), auth, db), coded("unauthorized"));
    await assert.rejects(
      authenticatedRepository(
        new Headers({ cookie: "better-auth.session_token=forged" }),
        auth,
        db,
      ),
      coded("unauthorized"),
    );
    const login = await post("sign-in/email", { email: emailB, password });
    const cookie = cookies(login);
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    assert.ok(session);
    await db
      .update(authSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authSessions.id, session.session.id));
    await assert.rejects(
      authenticatedRepository(new Headers({ cookie }), auth, db),
      coded("unauthorized"),
    );
  });
  const saved = await repoA.createExperiment({ id, draft, timeZone: "UTC" });
  const observedDate = saved.startDate;
  await t.test("B cannot list/get/save/finish/reopen A; A retains those operations", async () => {
    assert.deepEqual(await repoB.listExperiments(), []);
    await assert.rejects(repoB.getExperiment(id), coded("experimentMissing"));
    await assert.rejects(
      repoB.saveEntry(id, {
        observedDate,
        draft: { habitStatus: "done", values: { mood: 3 } },
        timeZone: "UTC",
      }),
      coded("experimentMissing"),
    );
    for (const type of ["finish", "reopen"] as const)
      await assert.rejects(
        repoB.changeLifecycle(id, { intent: { type }, requestId: randomUUID(), timeZone: "UTC" }),
        coded("experimentMissing"),
      );
    const entry = await repoA.saveEntry(id, {
      observedDate,
      draft: { habitStatus: "done", values: { mood: 8 } },
      timeZone: "UTC",
    });
    const edited = await repoA.saveEntry(id, {
      observedDate,
      draft: { habitStatus: "not_done", values: { mood: 5 } },
      timeZone: "UTC",
    });
    assert.equal(edited.entries.length, 1);
    assert.equal(entry.entries[0].id, edited.entries[0].id);
    await repoA.changeLifecycle(id, {
      intent: { type: "finish" },
      requestId: randomUUID(),
      timeZone: "UTC",
    });
    await assert.rejects(
      repoB.changeLifecycle(id, {
        intent: { type: "reopen" },
        requestId: randomUUID(),
        timeZone: "UTC",
      }),
      coded("experimentMissing"),
    );
    await repoA.changeLifecycle(id, {
      intent: { type: "reopen" },
      requestId: randomUUID(),
      timeZone: "UTC",
    });
  });
  await t.test("import and receipts belong only to the authenticated workspace", async () => {
    const imported = buildExperiment(draft, `local-${randomUUID()}`, observedDate);
    await repoA.importExperiments([imported]);
    assert.equal(await repoA.importStatus([imported]), true);
    assert.equal(await repoB.importStatus([imported]), false);
    await assert.rejects(repoB.getExperiment(imported.id), coded("experimentMissing"));
    await repoB.importExperiments([imported]);
    assert.equal(await repoB.importStatus([imported]), true);
    await repoB.saveEntry(imported.id, {
      observedDate,
      draft: { habitStatus: "not_done", values: {} },
      timeZone: "UTC",
    });
    assert.equal((await repoA.getExperiment(imported.id)).entries.length, 0);
    await assert.rejects(
      repoB.createExperiment({
        ...{ id: randomUUID(), draft, timeZone: "UTC" },
        workspaceId: "00000000-0000-4000-8000-000000000001",
      } as Parameters<typeof repoB.createExperiment>[0]),
    );
  });
  await t.test("verification validates a signed expiring library token", async () => {
    const message = mail.find((item) => item.to === emailA && item.subject.includes("Verify"));
    assert.ok(message);
    const url = message.text.match(/http[^\s]+/)?.[0];
    assert.ok(url);
    const verified = await auth.handler(new Request(url));
    assert.ok([200, 302].includes(verified.status));
    const [user] = await db.select().from(authUsers).where(eq(authUsers.id, a.user.id));
    assert.equal(user.emailVerified, true);
    const bad = await auth.handler(new Request(base + "/api/auth/verify-email?token=invalid"));
    assert.ok(bad.status >= 300);
  });
  await t.test(
    "forgot password replies generically for existing and missing accounts",
    async () => {
      const existing = await post("request-password-reset", {
        email: emailA,
        redirectTo: "/reset-password",
      });
      const missing = await post("request-password-reset", {
        email: `absent-${randomUUID()}@self-lab.test`,
        redirectTo: "/reset-password",
      });
      assert.equal(existing.status, 200);
      assert.equal(missing.status, 200);
      assert.deepEqual(await existing.json(), await missing.json());
    },
  );
  await t.test(
    "reset token is single-use, changes the password, and invalidates all old sessions",
    async () => {
      const message = mail
        .filter((item) => item.to === emailA && item.subject.includes("Reset"))
        .at(-1);
      assert.ok(message);
      const url = message.text.match(/http[^\s]+/)?.[0];
      assert.ok(url);
      const redirect = await auth.handler(new Request(url));
      const token = new URL(redirect.headers.get("location")!, base).searchParams.get("token");
      assert.ok(token);
      const newPassword = "A different long passphrase!";
      const responses = await Promise.all(
        [1, 2].map(() => post("reset-password", { token, newPassword })),
      );
      assert.equal(responses.filter((response) => response.ok).length, 1);
      assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: a.cookie }) }), null);
      assert.equal((await post("sign-in/email", { email: emailA, password })).status, 401);
      assert.equal(
        (await post("sign-in/email", { email: emailA, password: newPassword })).status,
        200,
      );
      assert.ok(!(await post("reset-password", { token, newPassword })).ok);
    },
  );
  await t.test("expired and invalid reset tokens cannot change the password", async () => {
    await post("request-password-reset", { email: emailB, redirectTo: "/reset-password" });
    const message = mail
      .filter((item) => item.to === emailB && item.subject.includes("Reset"))
      .at(-1)!;
    const url = message.text.match(/http[^\s]+/)![0];
    const token = new URL(url).pathname.split("/").at(-1)!;
    await db
      .update(authVerifications)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(authVerifications.value, b.user.id));
    assert.ok(
      !(await post("reset-password", { token, newPassword: "Another long passphrase!" })).ok,
    );
    assert.ok(
      !(await post("reset-password", { token: "invalid", newPassword: "Another long passphrase!" }))
        .ok,
    );
  });
  await t.test("logout invalidates the stored session without deleting experiments", async () => {
    const response = await post("sign-out", {}, b.cookie);
    assert.equal(response.status, 200);
    assert.equal(await auth.api.getSession({ headers: new Headers({ cookie: b.cookie }) }), null);
    assert.ok((await repoA.listExperiments()).some((item) => item.id === id));
  });
});
