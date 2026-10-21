import { latestMailLink } from "./mailpit";
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { openDatabase } from "../../src/server/db/client";
import {
  authUsers,
  authVerifications,
  experiments,
  localImports,
  dailyReflections,
  globalMetrics,
  workspaces,
} from "../../src/server/db/schema";
import {
  createPostgresRepository,
  ensureWorkspace,
} from "../../src/server/experiments/postgres-repository";
import { testDatabaseUrl } from "../../scripts/env";
import { buildCustomMetric, buildExperiment } from "../../src/features/experiments/model/actions";
import { builtInMetric } from "../../src/features/experiments/model/metrics";
import { addDays } from "../../src/lib/dates";

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function retry<T>(read: () => Promise<T> | T, timeout = 20000): Promise<T> {
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeout) {
    try {
      const result = await read();
      if (result) return result;
    } catch (error) {
      last = error;
    }
    await pause(75);
  }
  throw new Error(`Timed out: ${last instanceof Error ? last.message : String(read)}`);
}
interface ProtocolMessage {
  id?: number;
  result?: unknown;
  error?: { message: string };
  method?: string;
  params?: {
    type?: string;
    args?: { value?: unknown; description?: string }[];
    exceptionDetails?: { text?: string; exception?: { description?: string } };
  };
}
class Browser {
  private sequence = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  readonly errors: string[] = [];
  constructor(
    private socket: WebSocket,
    private commandTimeout = 10000,
  ) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as ProtocolMessage;
      if (message.id) {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown")
        this.errors.push(
          message.params?.exceptionDetails?.exception?.description ??
            message.params?.exceptionDetails?.text ??
            "Browser exception",
        );
      else if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error")
        this.errors.push(
          message.params.args?.map((arg) => String(arg.value ?? arg.description)).join(" ") ??
            "Console error",
        );
    });
    socket.addEventListener("close", () => {
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(new Error("Browser connection closed"));
      }
      this.pending.clear();
    });
  }
  async send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return new Promise<unknown>((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser command timed out: ${method}`));
      }, this.commandTimeout);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    }) as Promise<T>;
  }
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send<{
      result: { value: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    return result.result.value;
  }
  async wait(expression: string) {
    await retry(() => this.evaluate<boolean>(expression), Math.max(20000, this.commandTimeout * 2));
  }
  async click(text: string, selector = "button") {
    const point = await this.evaluate<{ x: number; y: number }>(
      `(()=>{const element=globalThis.__qa(${JSON.stringify(selector)}).find(el=>el.textContent.replace(/\\s+/g,' ').trim()===${JSON.stringify(text)});if(!element)throw Error('Missing target: '+${JSON.stringify(text)});if(element.disabled)throw Error('Disabled target: '+${JSON.stringify(text)});element.scrollIntoView({block:'center'});for(const r of element.getClientRects()){const x=r.x+r.width/2,y=r.y+r.height/2;if(r.width>0&&r.height>0&&element.contains(document.elementFromPoint(x,y)))return {x,y}}throw Error('Obscured target: '+${JSON.stringify(text)})})()`,
    );
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await this.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      clickCount: 1,
      ...point,
    });
    await this.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      clickCount: 1,
      ...point,
    });
  }
  async dialogOpen() {
    await this.wait("!!globalThis.__q('dialog[open]')");
    await pause(200);
    assert.ok(
      await this.evaluate("globalThis.__q('dialog[open]')?.matches(':modal')"),
      "Dialog must stay visibly open after effect cleanup",
    );
  }
  async fill(selector: string, value: string) {
    await this.evaluate(
      `(()=>{const element=globalThis.__q(${JSON.stringify(selector)});const proto=element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
  }
  async score(metric: string, value: number) {
    await this.evaluate(`globalThis.__q('#score-${metric}').focus()`);
    await this.key("Home", 36);
    for (let index = 1; index < value; index++) await this.key("ArrowRight", 39);
  }
  async key(key: string, code: number) {
    await this.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      windowsVirtualKeyCode: code,
    });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code });
  }
  async screenshot(path: string) {
    const result = await this.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
    writeFileSync(path, Buffer.from(result.data, "base64"));
  }
  close() {
    this.socket.close();
  }
}

test(
  "real browser → HTTP API → PostgreSQL: creation, check-ins, lifecycle, import, and responsive UI",
  { timeout: process.env.SELF_LAB_TEST_DEV === "1" ? 480000 : 240000 },
  async () => {
    const executable = [
      process.env.SELF_LAB_CHROME_PATH,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
    ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
    assert.ok(executable, "Install Chrome or set SELF_LAB_CHROME_PATH.");
    const databaseUrl = testDatabaseUrl();
    const { db, pool } = openDatabase(databaseUrl);
    const workspaceId = randomUUID();
    await migrate(db, { migrationsFolder: "drizzle" });
    await ensureWorkspace(db, workspaceId);
    let repository = createPostgresRepository(db, workspaceId);
    const testUsers: string[] = [];
    const testWorkspaces = new Set<string>([workspaceId]);
    const port = Number(process.env.SELF_LAB_TEST_PORT ?? 3101);
    const base = `http://127.0.0.1:${port}`;
    const development = process.env.SELF_LAB_TEST_DEV === "1";
    const server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        development ? "dev" : "start",
        ...(development ? ["--webpack"] : []),
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
          BETTER_AUTH_URL: base,
          BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
          SMTP_HOST: "127.0.0.1",
          SMTP_PORT: "1025",
        },
      },
    );
    let serverLog = "";
    server.stdout.on("data", (data) => {
      serverLog += String(data);
    });
    server.stderr.on("data", (data) => {
      serverLog += String(data);
    });
    const profile = mkdtempSync(join(tmpdir(), "self-lab-browser-"));
    const chrome = spawn(
      executable,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let chromeLog = "";
    chrome.stderr.on("data", (data) => {
      chromeLog += String(data);
    });
    let browser: Browser | undefined;
    try {
      await retry(() => {
        if (server.exitCode !== null) throw new Error(serverLog);
        return serverLog.includes("Ready");
      }, 60000);
      const debugPort = await retry(() => {
        if (chrome.exitCode !== null) throw new Error(chromeLog);
        const file = join(profile, "DevToolsActivePort");
        return existsSync(file) ? readFileSync(file, "utf8").split("\n")[0] : null;
      });
      const target = (await (
        await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })
      ).json()) as { webSocketDebuggerUrl: string };
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => {
        socket.addEventListener("open", () => resolve(), { once: true });
        socket.addEventListener("error", () => reject(new Error("Could not connect to Chrome")), {
          once: true,
        });
      });
      await retry(async () => {
        if (server.exitCode !== null) throw new Error(serverLog);
        return (await fetch(base + "/dashboard")).ok;
      }, 60000);
      if (development) {
        const experimentId = randomUUID();
        for (const path of [
          `/api/experiments/${experimentId}/entries`,
          `/api/experiments/${experimentId}/lifecycle`,
          "/api/imports",
          "/api/imports/status",
        ]) {
          await fetch(base + path, { method: "OPTIONS" });
        }
      }
      const page = new Browser(socket, development ? 60000 : 10000);
      browser = page;
      await page.send("Runtime.enable");
      await page.send("Page.enable");
      await page.send("Network.enable");
      await page.send("Page.addScriptToEvaluateOnNewDocument", {
        source:
          "globalThis.__selfLabDocument = crypto.randomUUID(); globalThis.__qa = (selector) => [...document.querySelectorAll(selector)].filter(element => element.checkVisibility()); globalThis.__q = (selector) => globalThis.__qa(selector)[0] ?? null;",
      });
      const timezone = new Date().getUTCHours() < 12 ? "Etc/GMT+12" : "Pacific/Kiritimati";
      await page.send("Emulation.setTimezoneOverride", { timezoneId: timezone });
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
      });
      async function navigate(route: string, heading: string) {
        const previous = await page.evaluate<string | undefined>("globalThis.__selfLabDocument");
        await page.send("Page.navigate", { url: base + route });
        await page.wait(
          `globalThis.__selfLabDocument!==${JSON.stringify(previous) ?? "undefined"}&&!!globalThis.__selfLabDocument`,
        );
        await page.wait(`globalThis.__q('h1')?.textContent.includes(${JSON.stringify(heading)})`);
        await page.wait(
          "!globalThis.__q('.auth-card form')||globalThis.__q('.auth-card form').dataset.ready==='true'",
        );
        if (await page.evaluate("!!globalThis.__q('.auth-card form')"))
          assert.equal(await page.evaluate("globalThis.__q('.auth-card form').method"), "post");
      }
      const onboardingHeading = "What would you like to understand about yourself?";
      const accountEmail = `browser-a-${randomUUID()}@self-lab.test`;
      const accountPassword = "A private browser passphrase!";
      async function register(email: string) {
        await navigate("/sign-up", "Create your account");
        await page.fill("#auth-email", email);
        await page.fill("#auth-password", accountPassword);
        await page.fill("#auth-confirm", accountPassword);
        await page.click("Create your account");
        await page.wait(`globalThis.__q('h1')?.textContent===${JSON.stringify(onboardingHeading)}`);
        const [user] = await db.select().from(authUsers).where(eq(authUsers.email, email));
        assert.ok(user);
        testUsers.push(user.id);
        const [workspace] = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.ownerUserId, user.id));
        assert.ok(workspace);
        testWorkspaces.add(workspace.id);
        repository = createPostgresRepository(db, workspace.id);
        return user;
      }
      async function signIn(email: string, password = accountPassword) {
        await navigate("/sign-in", "Sign in");
        await page.fill("#auth-email", email);
        await page.fill("#auth-password", password);
        await page.click("Sign in");
        await page.wait("location.pathname==='/dashboard'&&!globalThis.__q('#auth-email')");
      }
      async function signOut() {
        if (!(await page.evaluate("globalThis.__qa('.account-sign-out button').length>0")))
          await navigate("/account", "Account");
        await page.wait(
          "globalThis.__qa('.account-sign-out button').some(button=>!button.disabled)",
        );
        await page.click("Sign out", ".account-sign-out button");
        await page.wait("globalThis.__q('h1')?.textContent==='Sign in'");
      }
      async function browserCookie() {
        const result = await page.send<{ cookies: { name: string; value: string }[] }>(
          "Network.getCookies",
          { urls: [base] },
        );
        return result.cookies.map((item) => item.name + "=" + item.value).join("; ");
      }
      assert.equal((await fetch(base + "/api/experiments")).status, 401);
      await navigate("/dashboard", "Sign in");
      const serverForm = await page.evaluate(`(async()=>{
        const html=await (await fetch('/sign-up')).text();
        const doc=new DOMParser().parseFromString(html,'text/html');
        const form=doc.querySelector('form');
        return {
          method:form?.method,
          ready:form?.dataset.ready,
          inputsDisabled:[...doc.querySelectorAll('input')].length>0&&[...doc.querySelectorAll('input')].every(input=>input.disabled),
          submitDisabled:doc.querySelector('button[type=submit]')?.disabled,
        };
      })()`);
      assert.deepEqual(serverForm, {
        method: "post",
        ready: "false",
        inputsDisabled: true,
        submitDisabled: true,
      });
      const userA = await register(accountEmail);
      const repositoryA = repository;
      await navigate("/sign-in", onboardingHeading);
      // Authenticated visits to auth pages return to Dashboard, including empty onboarding.

      assert.deepEqual(await repository.listExperiments(), []);
      assert.equal(await page.evaluate("localStorage.getItem('self-lab:experiments')"), null);
      await page.wait("!!globalThis.__q('#score-mood')&&!!globalThis.__q('#score-energy')");
      await page.score("mood", 7);
      await page.score("energy", 6);
      await page.click("Save reflection");
      await page.wait(
        "globalThis.__q('.daily-reflection-summary')?.textContent.includes('Mood · 7/10')",
      );
      assert.equal((await repository.listReflections()).length, 1);
      await navigate("/dashboard", onboardingHeading);
      assert.ok(await page.evaluate("!!globalThis.__q('.daily-reflection-summary')"));
      await navigate("/account", "Account");
      await page.wait(
        "globalThis.__qa('#daily-measures button').some(button=>button.textContent.trim()==='+ Add custom measure'&&!button.disabled)",
      );
      await page.click("+ Add custom measure");
      await page.wait("!!globalThis.__q('#new-measure')");
      await page.fill("#new-measure", "Restfulness");
      await page.wait(
        "globalThis.__qa('#daily-measures button').some(button=>button.textContent.trim()==='Add measure'&&!button.disabled)",
      );
      await page.click("Add measure");
      await page.wait("document.body.textContent.includes('Restfulness')");
      const customGlobal = (await repository.listGlobalMetrics()).find(
        (item) => item.definition.kind === "custom",
      )!;
      await navigate("/dashboard", onboardingHeading);
      assert.equal(
        await page.evaluate("globalThis.__q('#onboarding-experiment-question').value"),
        "",
      );
      await page.click("Continue");
      await page.wait(
        "globalThis.__q('form [role=alert]')?.textContent==='Your question is required.'",
      );
      await page.fill("#onboarding-experiment-question", "How does reading relate to my focus?");
      await page.click("Continue");
      await page.wait("!!globalThis.__q('#onboarding-experiment-title')");
      assert.equal(await page.evaluate("globalThis.__qa('input[name=metrics]:checked').length"), 0);
      await page.fill("#onboarding-experiment-title", "Reading and focus");
      await page.fill("#onboarding-experiment-habit", "Read before bed");
      await page.click("Create experiment");
      await page.wait(
        "globalThis.__q('form [role=alert]')?.textContent==='Choose at least one metric to track.'",
      );
      await page.evaluate("globalThis.__q('input[name=metrics][value=mood]').click()");
      await page.evaluate(
        `globalThis.__q('input[name=metrics][value="${customGlobal.definition.id}"]').click()`,
      );
      // Lose the first response AFTER the server commits. Retrying must reuse the creation ID.
      await page.evaluate(`globalThis.__originalFetch=globalThis.fetch; globalThis.__loseResponse=true;
        globalThis.fetch=async (...args)=>{const response=await globalThis.__originalFetch(...args);globalThis.__lastStatus=response.status;
          if(globalThis.__loseResponse&&args[0]==='/api/experiments'&&args[1]?.method==='POST'){
            globalThis.__loseResponse=false;throw new TypeError('Simulated lost response');
          }return response;}`);
      await page.click("Create experiment");
      await page.wait("globalThis.__q('form [role=alert]')?.textContent.includes('server')");
      assert.equal((await repository.listExperiments()).length, 1);
      assert.equal(
        await page.evaluate("globalThis.__q('#onboarding-experiment-title').value"),
        "Reading and focus",
      );
      await page.click("Create experiment");
      await page.wait("globalThis.__q('h1')?.textContent==='Reading and focus'");
      assert.equal((await repository.listExperiments()).length, 1);
      const firstId = (await page.evaluate<string>("location.pathname")).split("/").at(-1)!;
      let first = await repository.getExperiment(firstId);
      const custom = first.metrics.find((metric) => metric.kind === "custom")!;
      assert.equal(custom.kind === "custom" ? custom.label : "", "Restfulness");
      assert.equal(first.outcomeSource, "global");
      assert.equal(first.entries.length, 0);
      const today = await page.evaluate<string>(
        "(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})()",
      );
      assert.equal(first.startDate, today, "Server must respect the browser's local calendar date");
      assert.notEqual(today, new Date().toISOString().slice(0, 10));
      await navigate(`/experiments/${firstId}`, "Reading and focus");
      assert.deepEqual(await repository.getExperiment(firstId), first);
      await page.click("Check in today");
      await page.dialogOpen();
      assert.ok(await page.evaluate("!globalThis.__q('dialog input[type=range]')"));
      await page.evaluate("globalThis.__q('input[name=habitStatus][value=done]').click()");
      await page.fill("#entry-note", "Read a chapter");
      await page.click("Save check-in");
      await page.wait("!globalThis.__q('dialog')");
      first = await repository.getExperiment(firstId);
      const originalEntry = first.entries[0];
      assert.equal(originalEntry.observedDate, today);
      assert.deepEqual(originalEntry.values, {});
      assert.equal((await repository.listReflections())[0].values.mood, 7);
      assert.equal(originalEntry.habitStatus, "done");
      await page.wait(
        "document.body.textContent.includes('1 observation recorded. Add more check-ins to see a trend.')",
      );
      assert.equal(
        await page.evaluate("globalThis.__qa('.metric-chart path[data-segment]').length"),
        0,
      );
      await navigate(`/experiments/${firstId}`, "Reading and focus");
      await page.click("Edit check-in");
      await page.dialogOpen();
      assert.equal(await page.evaluate("globalThis.__q('#entry-note').value"), "Read a chapter");
      const suffix = randomUUID().replaceAll("-", "");
      const fn = `browser_fail_score_${suffix}`,
        trigger = `browser_fail_trigger_${suffix}`;
      await pool.query(
        `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.note = 'Keep input after failed save' THEN RAISE EXCEPTION 'Deliberate database failure'; END IF; RETURN NEW; END $$`,
      );
      await pool.query(
        `CREATE TRIGGER ${trigger} BEFORE UPDATE ON daily_entries FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
      );
      try {
        await page.fill("#entry-note", "Keep input after failed save");
        await page.click("Save check-in");
        await page.wait(
          "globalThis.__q('dialog [role=alert]')?.textContent==='The workspace database is unavailable. Your input is unchanged. Please retry.'",
        );
        assert.equal(
          await page.evaluate("globalThis.__q('#entry-note').value"),
          "Keep input after failed save",
        );
        assert.deepEqual(await repository.getExperiment(firstId), first);
      } finally {
        await pool.query(`DROP TRIGGER ${trigger} ON daily_entries`);
        await pool.query(`DROP FUNCTION ${fn}()`);
      }
      await page.fill("#entry-note", "Edited saved observation");
      await page.click("Save check-in");
      await page.wait("!globalThis.__q('dialog')");
      first = await repository.getExperiment(firstId);
      assert.equal(first.entries.length, 1);
      assert.equal(first.entries[0].id, originalEntry.id);
      assert.equal(first.entries[0].recordedAt, originalEntry.recordedAt);
      assert.ok(first.entries[0].updatedAt);
      assert.deepEqual(first.entries[0].values, {});

      await page.click("Experiments", ".nav-link");
      await page.wait("!!globalThis.__q('.filter-tabs')");
      await page.click("New experiment", "a");
      await page.wait("!!globalThis.__q('#experiment-question')");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-question').value"), "");
      assert.equal(await page.evaluate("globalThis.__qa('input[name=metrics]:checked').length"), 0);
      await page.click("Coffee & sleep", ".idea-grid button");
      await page.click("Continue");
      await page.wait("!!globalThis.__q('#experiment-title')");
      await page.fill("#experiment-title", "Afternoon coffee");
      await page.evaluate("globalThis.__q('input[name=metrics][value=mood]').click()");
      await page.click("Create experiment");
      await page.wait("globalThis.__q('h1')?.textContent==='Afternoon coffee'");
      const secondId = (await page.evaluate<string>("location.pathname")).split("/").at(-1)!;
      await navigate("/dashboard", "Hello, curious mind");
      const documentId = await page.evaluate("globalThis.__selfLabDocument");
      assert.equal(
        await page.evaluate("globalThis.__q('.daily-workflow-summary').textContent"),
        "1 of 2 checked in today",
      );
      assert.equal(await page.evaluate("globalThis.__qa('.daily-workflow-row').length"), 2);
      assert.ok(
        await page.evaluate(
          "!globalThis.__q('.stats-grid,.focus-card,.today-card,.reflection-card,.local-import-notice,.footer')",
        ),
      );
      assert.ok(
        await page.evaluate(
          `globalThis.__q('.daily-workflow-row[data-experiment-id="${firstId}"]').classList.contains('daily-workflow-checked')`,
        ),
      );
      assert.equal(
        await page.evaluate(
          `globalThis.__q('.daily-workflow-row[data-experiment-id="${firstId}"] [role=progressbar]').getAttribute('aria-valuenow')`,
        ),
        "1",
      );
      assert.equal(
        await page.evaluate(
          `globalThis.__q('.daily-workflow-row[data-experiment-id="${secondId}"] [role=progressbar]').getAttribute('aria-valuenow')`,
        ),
        "1",
      );
      assert.ok(
        await page.evaluate(
          `(()=>{const first=globalThis.__q('.daily-workflow-row[data-experiment-id="${firstId}"] .daily-workflow-actions button');const second=globalThis.__q('.daily-workflow-row[data-experiment-id="${secondId}"] .daily-workflow-actions button');return first&&second&&Math.abs(first.getBoundingClientRect().height-second.getBoundingClientRect().height)<1&&Math.abs(first.getBoundingClientRect().left-second.getBoundingClientRect().left)<1&&first.classList.contains('button-secondary')&&second.classList.contains('button-primary')})()`,
        ),
      );
      await page.click("Edit", `.daily-workflow-row[data-experiment-id="${firstId}"] button`);
      await page.dialogOpen();
      await page.click("Cancel", "dialog button");
      await page.wait("!globalThis.__q('dialog')");
      await page.click("Check in", `.daily-workflow-row[data-experiment-id="${secondId}"] button`);
      await page.dialogOpen();
      await page.evaluate("globalThis.__q('input[name=habitStatus][value=not_done]').click()");
      await page.click("Save check-in");
      await page.wait(
        "!globalThis.__q('dialog')&&globalThis.__q('.daily-workflow-summary')?.textContent==='2 of 2 checked in today'",
      );
      assert.ok(
        await page.evaluate(
          `globalThis.__q('.daily-workflow-row[data-experiment-id="${secondId}"]').classList.contains('daily-workflow-checked')`,
        ),
      );
      assert.ok(
        await page.evaluate(
          `globalThis.__q('.daily-workflow-row[data-experiment-id="${secondId}"] button').textContent.includes('Edit')`,
        ),
      );
      assert.ok(await page.evaluate("!globalThis.__q('.daily-workflow .save-feedback')"));
      assert.equal(await page.evaluate("globalThis.__selfLabDocument"), documentId);
      assert.equal((await repository.getExperiment(secondId)).entries[0].habitStatus, "not_done");
      await navigate("/dashboard", "Hello, curious mind");
      assert.equal(
        await page.evaluate("globalThis.__q('.daily-workflow-summary').textContent"),
        "2 of 2 checked in today",
      );
      const reflectionBeforeEdit = (await repository.listReflections())[0];
      await page.click("Edit", ".daily-reflection button");
      await page.wait("!!globalThis.__q('.daily-reflection #score-mood')");
      await page.score("mood", 5);
      await page.click("Save reflection");
      await page.wait(
        "globalThis.__q('.daily-reflection-summary')?.textContent.includes('Mood · 5/10')",
      );
      const reflectionAfterEdit = (await repository.listReflections())[0];
      assert.equal((await repository.listReflections()).length, 1);
      assert.equal(reflectionAfterEdit.id, reflectionBeforeEdit.id);
      assert.equal(reflectionAfterEdit.recordedAt, reflectionBeforeEdit.recordedAt);
      assert.ok(reflectionAfterEdit.updatedAt);
      await navigate(`/experiments/${firstId}`, "Reading and focus");
      await page.click("How was this calculated?", "summary");
      await page.wait("!!globalThis.__q('.comparison-table tbody tr:first-child td strong')");
      assert.ok(
        await page.evaluate(
          "globalThis.__q('.comparison-table tbody tr:first-child td strong')?.textContent.includes('5 / 10')",
        ),
      );
      await navigate(`/experiments/${secondId}`, "Afternoon coffee");
      await page.click("How was this calculated?", "summary");
      await page.wait("!!globalThis.__q('.comparison-table tbody tr')");
      assert.ok(
        await page.evaluate(
          "globalThis.__qa('.comparison-table tbody tr').some(row=>row.textContent.includes('Mood')&&row.textContent.includes('5 / 10'))",
        ),
      );

      await navigate(`/experiments/${firstId}`, "Reading and focus");
      await page.click("Finish experiment");
      await page.dialogOpen();
      await page.click("Finish & view results", "dialog button");
      await page.wait("!globalThis.__q('dialog')&&!!globalThis.__q('.observations-disclosure')");
      const finished = await repository.getExperiment(firstId);
      assert.equal(finished.status, "completed");
      assert.ok(finished.completedAt);
      assert.deepEqual(finished.entries, first.entries);
      assert.equal(await page.evaluate("globalThis.__q('.observations-disclosure').open"), false);
      assert.ok(await page.evaluate("!!globalThis.__q('.comparison-card')"));
      await navigate(`/experiments/${firstId}`, "Reading and focus");
      await page.click("Reopen experiment");
      await page.wait(
        "globalThis.__qa('button').some(e=>e.textContent.trim()==='Finish experiment')",
      );
      assert.equal((await repository.getExperiment(firstId)).status, "active");
      assert.deepEqual((await repository.getExperiment(firstId)).entries, first.entries);

      // Arrange a historical browser backup; only the explicit UI action may import it.
      const importedCustom = buildCustomMetric("Restfulness", randomUUID());
      const imported = buildExperiment(
        {
          title: "Imported reading",
          question: "How does reading relate to rest?",
          habit: "Read before bed",
          durationDays: 7,
          metrics: [builtInMetric("sleep"), importedCustom],
        },
        `local-user-${randomUUID()}`,
        addDays(today, -2),
      );
      imported.entries = [
        {
          id: "original-browser-entry",
          observedDate: addDays(today, -1),
          habitStatus: "done",
          recordedAt: new Date().toISOString(),
          updatedAt: null,
          origin: "check_in",
          values: { sleep: 7, [importedCustom.id]: 8 },
          note: "Original local note",
        },
      ];
      const rawBackup = JSON.stringify({ version: 5, experiments: [imported] });
      await page.evaluate(
        `localStorage.setItem('self-lab:experiments',${JSON.stringify(rawBackup)})`,
      );
      await navigate("/dashboard", "Hello, curious mind");
      assert.ok(await page.evaluate("!globalThis.__q('.local-import-notice')"));
      await navigate("/account", "Account");
      await page.wait("!!globalThis.__q('.local-import-notice button:not(:disabled)')");
      assert.equal((await repository.listExperiments()).length, 2);
      await page.click("Import local experiments");
      await page.wait(
        "globalThis.__q('.local-import-notice [role=status]')?.textContent.includes('Imported successfully')",
      );
      assert.deepEqual(await repository.getExperiment(imported.id), imported);
      assert.equal(await page.evaluate("localStorage.getItem('self-lab:experiments')"), rawBackup);
      await navigate(`/experiments/${imported.id}`, "Imported reading");
      await page.wait("!globalThis.__q('.local-import-notice button')");
      await page.click("Check in today");
      await page.dialogOpen();
      await page.click("Yesterday", "dialog button");
      assert.equal(
        await page.evaluate("globalThis.__q('#entry-note').value"),
        "Original local note",
      );
      await page.evaluate("globalThis.__q('input[name=habitStatus][value=not_done]').click()");
      await page.score(importedCustom.id, 4);
      await page.click("Save check-in");
      await page.wait("!globalThis.__q('dialog')");
      const yesterdayEdit = await repository.getExperiment(imported.id);
      assert.equal(yesterdayEdit.entries.length, 1);
      assert.equal(yesterdayEdit.entries[0].id, "original-browser-entry");
      assert.equal(yesterdayEdit.entries[0].habitStatus, "not_done");
      assert.equal(yesterdayEdit.entries[0].values[importedCustom.id], 4);
      await navigate("/dashboard", "Hello, curious mind");
      assert.ok(await page.evaluate("!globalThis.__q('.local-import-notice')"));
      assert.deepEqual(await repository.getExperiment(imported.id), yesterdayEdit);
      assert.equal(await page.evaluate("localStorage.getItem('self-lab:experiments')"), rawBackup);

      const expired = buildExperiment(
        {
          title: "Expired active target",
          question: "How does walking relate to mood?",
          habit: "Walk outside",
          durationDays: 7,
          metrics: [builtInMetric("mood")],
        },
        `expired-${randomUUID()}`,
        addDays(today, -10),
      );
      await repository.importExperiments([expired]);
      await navigate(`/experiments/${expired.id}`, expired.title);
      await page.click("Keep observing");
      await page.dialogOpen();
      await page.click("Extend observation target", "dialog button");
      await page.wait("!globalThis.__q('dialog')");
      const extended = await repository.getExperiment(expired.id);
      assert.equal(extended.durationDays, 17);
      assert.equal(extended.targetExtensions.length, 1);
      await page.click("Check in today");
      await page.dialogOpen();
      await page.click("Yesterday", "dialog button");
      await page.evaluate("globalThis.__q('input[name=habitStatus][value=not_done]').click()");
      await page.click("Save check-in");
      await page.wait("!globalThis.__q('dialog')");
      assert.equal(
        (await repository.getExperiment(expired.id)).entries[0].observedDate,
        addDays(today, -1),
      );

      await navigate(
        "/experiments/morning-walk-completed",
        "Morning walks, mood, and productivity",
      );
      assert.equal(await page.evaluate("globalThis.__qa('.detail-actions button').length"), 0);
      assert.ok(!(await repository.listExperiments()).some((item) => item.source === "sample"));
      for (const [route, heading] of [
        ["/dashboard", "Hello, curious mind"],
        ["/account", "Account"],
        ["/experiments", "My experiments"],
        ["/experiments/new", "Start with curiosity"],
        [`/experiments/${firstId}`, "Reading and focus"],
        [`/experiments/${firstId}`, "Reading and focus"],
      ]) {
        await page.send("Emulation.setDeviceMetricsOverride", {
          width: 390,
          height: 844,
          deviceScaleFactor: 1,
          mobile: true,
        });
        await navigate(route, heading);
        assert.ok(
          await page.evaluate("document.documentElement.scrollWidth<=window.innerWidth"),
          `Mobile overflow: ${route}`,
        );
        assert.equal(await page.evaluate("/[А-Яа-яЁё]/.test(document.body.textContent)"), false);
      }
      await page.click("Edit check-in");
      await page.dialogOpen();
      assert.ok(
        await page.evaluate(
          "globalThis.__q('dialog').scrollWidth<=globalThis.__q('dialog').clientWidth",
        ),
      );
      await page.screenshot(join(profile, "postgres-check-in-mobile.png"));
      await page.key("Escape", 27);
      await page.wait("!globalThis.__q('dialog')");

      // A failed backend read must keep the old local backup and offer a real retry.
      const offlineScript = await page.send<{ identifier: string }>(
        "Page.addScriptToEvaluateOnNewDocument",
        {
          source:
            "globalThis.__realFetch=globalThis.fetch; globalThis.fetch=(...args)=>args[0]==='/api/experiments'?Promise.reject(new TypeError('Simulated offline backend')):globalThis.__realFetch(...args);",
        },
      );
      await navigate("/dashboard", "Workspace unavailable");
      assert.equal(await page.evaluate("localStorage.getItem('self-lab:experiments')"), rawBackup);
      await page.evaluate("globalThis.fetch=globalThis.__realFetch");
      await page.click("Retry loading");
      await page.wait("globalThis.__q('h1')?.textContent.includes('Hello, curious mind')");
      await page.send("Page.removeScriptToEvaluateOnNewDocument", {
        identifier: offlineScript.identifier,
      });
      await page.screenshot(join(profile, "postgres-dashboard-mobile.png"));
      const apiCookie = await browserCookie();

      for (const body of [
        { invalid: true },
        { id: randomUUID(), draft: { title: "Invalid" }, timeZone: "Invalid/Zone" },
      ]) {
        const response = await fetch(base + "/api/experiments", {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: apiCookie },
          body: JSON.stringify(body),
        });
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), { error: { code: "invalidRequest" } });
      }
      const crossSite = await fetch(base + "/api/experiments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: apiCookie,
          Origin: "https://other.example",
        },
        body: "{}",
      });
      assert.equal(crossSite.status, 400);
      const tooLarge = await fetch(base + "/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: apiCookie },
        body: JSON.stringify({ padding: "x".repeat(2 * 1024 * 1024) }),
      });
      assert.equal(tooLarge.status, 413);
      assert.deepEqual(await tooLarge.json(), { error: { code: "payloadTooLarge" } });
      await navigate("/account", "Account");
      assert.ok(
        await page.evaluate(`document.body.textContent.includes(${JSON.stringify(accountEmail)})`),
      );
      const verificationLink = await latestMailLink(accountEmail, "Verify");
      await page.send("Page.navigate", { url: verificationLink });
      await page.wait(
        "globalThis.__q('h1')?.textContent==='Account'&&document.body.textContent.includes('Email verified')",
      );
      await signOut();
      await navigate(`/experiments/${firstId}`, "Sign in");
      await signIn(accountEmail);
      await page.wait("globalThis.__q('h1')?.textContent==='Hello, curious mind'");
      await navigate(`/experiments/${firstId}`, "Reading and focus");
      assert.equal((await repositoryA.getExperiment(firstId)).entries.length, 1);
      await signOut();
      const emailB = `browser-b-${randomUUID()}@self-lab.test`;
      const userB = await register(emailB);
      assert.notEqual(userA.id, userB.id);
      assert.deepEqual(await repository.listExperiments(), []);
      assert.deepEqual(await repository.listReflections(), []);
      assert.ok(
        !(await repository.listGlobalMetrics()).some((item) => item.definition.id === custom.id),
      );
      await navigate(`/experiments/${firstId}`, "Experiment not found");
      const cookieB = await browserCookie();
      const foreignMeasure = await fetch(base + "/api/daily-reflections", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookieB },
        body: JSON.stringify({
          observedDate: today,
          timeZone: timezone,
          draft: { values: { [custom.id]: 7 } },
        }),
      });
      assert.equal(foreignMeasure.status, 400);
      assert.deepEqual(await repository.listReflections(), []);
      for (const [method, path, body] of [
        ["GET", `/api/experiments/${firstId}`, undefined],
        [
          "PUT",
          `/api/experiments/${firstId}/entries`,
          {
            observedDate: today,
            timeZone: timezone,
            draft: { habitStatus: "done", values: { mood: 2 } },
          },
        ],
        [
          "PATCH",
          `/api/experiments/${firstId}/lifecycle`,
          { timeZone: timezone, requestId: randomUUID(), intent: { type: "finish" } },
        ],
        [
          "PATCH",
          `/api/experiments/${firstId}/lifecycle`,
          { timeZone: timezone, requestId: randomUUID(), intent: { type: "reopen" } },
        ],
      ] as const) {
        const response = await fetch(base + path, {
          method,
          headers: { "Content-Type": "application/json", Cookie: cookieB },
          body: body ? JSON.stringify(body) : undefined,
        });
        assert.equal(response.status, 404);
        assert.deepEqual(await response.json(), { error: { code: "experimentMissing" } });
      }
      const fakeOwner = await fetch(base + "/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookieB },
        body: JSON.stringify({ workspaceId, experiments: [imported] }),
      });
      assert.equal(fakeOwner.status, 400);
      assert.deepEqual((await repositoryA.getExperiment(firstId)).entries[0].values, {});
      assert.equal((await repositoryA.listReflections())[0].values.mood, 5);
      await navigate("/account", "Account");
      await signOut();
      await navigate("/forgot-password", "Reset your password");
      await page.fill("#auth-email", emailB);
      await page.click("Send reset instructions");
      await page.wait(
        "globalThis.__q('[role=status]')?.textContent.includes('If an account exists')",
      );
      const resetLink = await latestMailLink(emailB, "Reset");
      await page.send("Page.navigate", { url: resetLink });
      await page.wait(
        "globalThis.__q('h1')?.textContent==='Choose a new password'&&globalThis.__q('.auth-card form')?.dataset.ready==='true'",
      );
      const replacementPassword = "A replacement browser passphrase!";
      await page.fill("#auth-password", replacementPassword);
      await page.fill("#auth-confirm", replacementPassword);
      await page.click("Save new password");
      await page.wait(
        "globalThis.__q('[role=status]')?.textContent.includes('password has been updated')",
      );
      await signIn(emailB, replacementPassword);
      await page.wait(`globalThis.__q('h1')?.textContent===${JSON.stringify(onboardingHeading)}`);
      assert.equal(
        (await fetch(base + "/api/experiments", { headers: { Cookie: cookieB } })).status,
        401,
      );
      await signOut();
      for (const [route, heading] of [
        ["/sign-in", "Sign in"],
        ["/sign-up", "Create your account"],
        ["/forgot-password", "Reset your password"],
        ["/reset-password", "Choose a new password"],
      ]) {
        await navigate(route, heading);
        assert.ok(
          await page.evaluate("document.documentElement.scrollWidth<=window.innerWidth"),
          `Auth mobile overflow: ${route}`,
        );
        assert.equal(await page.evaluate("/[А-Яа-яЁё]/.test(document.body.textContent)"), false);
      }
      await page.screenshot(join(profile, "auth-mobile.png"));
      const verificationToken = new URL(verificationLink).searchParams.get("token");
      const resetToken = new URL(resetLink).pathname.split("/").at(-1);
      assert.ok(verificationToken && resetToken);
      assert.ok(
        !serverLog.includes(verificationToken),
        "Verification token must not appear in server logs",
      );
      assert.ok(!serverLog.includes(resetToken), "Reset token must not appear in server logs");
      assert.ok(
        !serverLog.includes(accountPassword) && !serverLog.includes(replacementPassword),
        "Passwords must not appear in server logs",
      );
      assert.doesNotMatch(serverLog, /[?&](?:email|password|confirmPassword|newPassword)=/i);
      assert.equal(page.errors.length, 0, page.errors.join("\n"));
      assert.doesNotMatch(serverLog, /dropped from rendering/);
      console.log(
        `Browser mode: ${development ? "development" : "production"}; screenshots: ${profile}`,
      );
    } catch (error) {
      console.error(
        "Application server log:",
        serverLog
          .replace(/([?&](?:token|password|confirmPassword|newPassword)=)[^&\s]+/gi, "$1[redacted]")
          .replace(/reset-password\/[A-Za-z0-9_-]+/g, "reset-password/[redacted]"),
      );
      if (browser) {
        console.error(
          "Browser diagnostics:",
          await browser
            .evaluate(
              "({path:location.pathname,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent),status:globalThis.__lastStatus})",
            )
            .catch(() => null),
        );
        await browser.screenshot(join(profile, "failure.png")).catch(() => undefined);
        console.error("Failure screenshot:", join(profile, "failure.png"));
      }
      throw error;
    } finally {
      browser?.close();
      chrome.kill("SIGTERM");
      chrome.stderr.destroy();
      server.kill("SIGTERM");
      server.stdout.destroy();
      server.stderr.destroy();
      const workspaceIds = [...testWorkspaces];
      await db.delete(experiments).where(inArray(experiments.workspaceId, workspaceIds));
      await db.delete(localImports).where(inArray(localImports.workspaceId, workspaceIds));
      await db.delete(dailyReflections).where(inArray(dailyReflections.workspaceId, workspaceIds));
      await db.delete(globalMetrics).where(inArray(globalMetrics.workspaceId, workspaceIds));
      await db.delete(workspaces).where(inArray(workspaces.id, workspaceIds));
      if (testUsers.length) {
        await db.delete(authVerifications).where(inArray(authVerifications.value, testUsers));
        await db.delete(authUsers).where(inArray(authUsers.id, testUsers));
      }
      await pool.end();
    }
  },
);
