import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Experiment } from "../../src/features/experiments/model/types";

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
  constructor(private socket: WebSocket) {
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
      }, 10000);
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
    await retry(() => this.evaluate<boolean>(expression));
  }
  async click(text: string, selector = "button") {
    const point = await this.evaluate<{ x: number; y: number }>(
      `(()=>{const element=globalThis.__qa(${JSON.stringify(selector)}).find(el=>el.textContent.replace(/\\s+/g,' ').trim()===${JSON.stringify(text)});if(!element)throw Error('Missing target: '+${JSON.stringify(text)});if(element.disabled)throw Error('Disabled target: '+${JSON.stringify(text)});element.scrollIntoView({block:'center'});const r=element.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;if(!element.contains(document.elementFromPoint(x,y)))throw Error('Obscured target: '+${JSON.stringify(text)});return {x,y}})()`,
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
  "critical browser flows: fresh forms, storage failures, reload, check-in edits, local dates, and responsive UI",
  { timeout: 120000 },
  async () => {
    const executable = [
      process.env.SELF_LAB_CHROME_PATH,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
    ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
    assert.ok(
      executable,
      "Install Chrome or set SELF_LAB_CHROME_PATH before running browser tests.",
    );
    const port = Number(process.env.SELF_LAB_TEST_PORT ?? 3101);
    const externalBase = process.env.SELF_LAB_TEST_BASE_URL;
    const base = externalBase ?? `http://127.0.0.1:${port}`;
    const server = externalBase
      ? undefined
      : spawn(
          process.execPath,
          [
            "node_modules/next/dist/bin/next",
            "start",
            "--hostname",
            "127.0.0.1",
            "--port",
            String(port),
          ],
          { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
        );
    let serverLog = "";
    server?.stdout.on("data", (data) => {
      serverLog += String(data);
    });
    server?.stderr.on("data", (data) => {
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
      if (server)
        await retry(() => {
          if (server.exitCode !== null) throw new Error(serverLog);
          return serverLog.includes("Ready");
        });
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
      const page = new Browser(socket);
      browser = page;
      await page.send("Runtime.enable");
      await page.send("Page.enable");
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
      }
      async function workspace() {
        return page.evaluate<{ version: number; experiments: Experiment[] }>(
          "JSON.parse(localStorage.getItem('self-lab:experiments'))",
        );
      }
      async function userExperiment(id: string) {
        const data = await workspace();
        const found = data.experiments.find((item) => item.id === id);
        assert.ok(found);
        return found;
      }
      await navigate("/dashboard", "Hello, curious mind");
      assert.equal(await page.evaluate("document.documentElement.lang"), "en");
      assert.equal(await page.evaluate("/[А-Яа-яЁё]/.test(document.body.textContent)"), false);
      await page.screenshot(join(profile, "dashboard-desktop.png"));
      const yesterdayDate = await page.evaluate<string>(
        "(()=>{const d=new Date();d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})()",
      );
      const initial = await workspace();
      const seed = initial.experiments.find((item) => item.id === "morning-walk-daily");
      assert.ok(seed);
      seed.entries = seed.entries.filter((entry) => entry.observedDate !== yesterdayDate);
      await page.evaluate(
        `localStorage.setItem('self-lab:experiments',${JSON.stringify(JSON.stringify(initial))})`,
      );
      await navigate("/dashboard", "Hello, curious mind");
      for (const label of ["Check in", "Check in today"]) {
        await page.click(label);
        await page.dialogOpen();
        await page.screenshot(join(profile, `dashboard-${label.replaceAll(" ", "-")}-dialog.png`));
        await page.click("Cancel");
        await page.wait("!globalThis.__q('dialog')");
      }
      await page.click("Check in");
      await page.dialogOpen();
      await page.click("Yesterday");
      await page.dialogOpen();
      assert.equal(
        await page.evaluate("globalThis.__q('button[aria-pressed=true]').textContent"),
        "Yesterday",
      );
      const sampleId = "morning-walk-daily";
      const previousSample = await userExperiment(sampleId);
      await page.evaluate("globalThis.__q('input[name=habitStatus][value=not_done]').click()");
      await page.score("mood", 4);
      await page.fill("#entry-note", "Yesterday observed, recorded today");
      await page.click("Save check-in");
      await page.wait("!globalThis.__q('dialog')");
      let sample = await userExperiment(sampleId);
      assert.equal(sample.entries.length, previousSample.entries.length + 1);
      const yesterdayEntry = sample.entries.find((entry) => entry.observedDate === yesterdayDate);
      assert.ok(yesterdayEntry);
      assert.equal(yesterdayEntry.habitStatus, "not_done");
      assert.ok(yesterdayEntry.recordedAt);
      assert.equal(yesterdayEntry.updatedAt, null);
      const recordedAt = yesterdayEntry.recordedAt;
      await navigate("/dashboard", "Hello, curious mind");
      sample = await userExperiment(sampleId);
      assert.equal(
        sample.entries.find((entry) => entry.observedDate === yesterdayDate)?.recordedAt,
        recordedAt,
      );
      await page.click("Check in today");
      await page.dialogOpen();
      await page.click("Yesterday");
      await page.dialogOpen();
      assert.equal(
        await page.evaluate("globalThis.__q('#entry-note').value"),
        "Yesterday observed, recorded today",
      );
      await page.fill("#entry-note", "Yesterday edited without duplication");
      await page.click("Save check-in");
      await page.wait("!globalThis.__q('dialog')");
      sample = await userExperiment(sampleId);
      assert.equal(sample.entries.length, previousSample.entries.length + 1);
      const editedYesterday = sample.entries.find((entry) => entry.observedDate === yesterdayDate);
      assert.equal(editedYesterday?.recordedAt, recordedAt);
      assert.ok(editedYesterday?.updatedAt);

      await page.click("New experiment", "a");
      await page.wait("!!globalThis.__q('#experiment-title')");
      await page.click("Create experiment");
      await page.wait(
        "globalThis.__q('form [role=alert]')?.textContent.includes('Experiment name is required')",
      );
      await page.fill("#experiment-title", "First browser experiment");
      await page.fill("#experiment-question", "Do walks relate to my mood?");
      await page.fill("#experiment-habit", "Walk for 20 minutes");
      await page.click("Create experiment");
      await page.wait("globalThis.__q('h1')?.textContent==='First browser experiment'");
      const firstId = (await page.evaluate<string>("location.pathname")).split("/").at(-1);
      assert.ok(firstId);
      const expectedLocal = await page.evaluate<string>(
        "`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`",
      );
      assert.equal((await userExperiment(firstId)).startDate, expectedLocal);
      assert.notEqual(expectedLocal, await page.evaluate("new Date().toISOString().slice(0,10)"));
      await page.click("Experiments", ".nav-link");
      await page.wait("!!globalThis.__q('.filter-tabs')");
      await page.click("New experiment", "a");
      await page.wait("!!globalThis.__q('#experiment-title')");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-title').value"), "");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-question').value"), "");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-habit').value"), "");
      assert.equal(await page.evaluate("globalThis.__q('#duration-days').value"), "14");
      assert.equal(await page.evaluate("globalThis.__qa('input[name=metrics]:checked').length"), 1);
      await page.fill("#experiment-title", "Second browser experiment");
      await page.fill("#experiment-question", "How does this habit relate to energy?");
      await page.fill("#experiment-habit", "Take a short walk");
      await page.evaluate("globalThis.__q('input[name=metrics][value=energy]').click()");
      await page.evaluate(
        "globalThis.__originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError')}",
      );
      await page.click("Create experiment");
      await page.wait(
        "globalThis.__q('form [role=alert]')?.textContent.includes('Could not save')",
      );
      assert.equal(
        await page.evaluate("globalThis.__q('#experiment-title').value"),
        "Second browser experiment",
      );
      assert.equal(
        (await workspace()).experiments.filter((item) => item.source === "user").length,
        1,
      );
      await page.evaluate("Storage.prototype.setItem=globalThis.__originalSetItem");
      await page.click("Create experiment");
      await page.wait("globalThis.__q('h1')?.textContent==='Second browser experiment'");
      const secondId = (await page.evaluate<string>("location.pathname")).split("/").at(-1);
      assert.ok(secondId);
      assert.notEqual(firstId, secondId);
      assert.equal(
        (await workspace()).experiments.filter((item) => item.source === "user").length,
        2,
      );
      await page.click("Check in today");
      await page.dialogOpen();
      assert.equal(
        await page.evaluate(
          "globalThis.__qa('dialog button').find(e=>e.textContent==='Yesterday').disabled",
        ),
        true,
      );
      assert.equal(
        await page.evaluate("globalThis.__qa('input[name=habitStatus]:checked').length"),
        0,
      );
      assert.ok(
        await page.evaluate(
          "[...globalThis.__qa('.score-output')].every(el=>el.textContent.includes('Not rated'))",
        ),
      );
      await page.click("Save check-in");
      await page.wait(
        "globalThis.__q('dialog [role=alert]')?.textContent.includes('Choose Done or Not done')",
      );
      assert.equal((await userExperiment(secondId)).entries.length, 0);
      await page.evaluate("globalThis.__q('input[name=habitStatus][value=done]').click()");
      await page.score("mood", 6);
      await page.fill("#entry-note", "A day worth remembering");
      await page.evaluate(
        "globalThis.__OriginalDate=Date;globalThis.Date=class extends globalThis.__OriginalDate{constructor(...args){super(...(args.length?args:[globalThis.__OriginalDate.now()+86400000]))}};window.dispatchEvent(new Event('focus'))",
      );
      await page.wait("globalThis.__q('.detail-progress-card h2')?.textContent==='Day 2 of 14'");
      assert.ok(await page.evaluate("!!globalThis.__q('dialog[open]')"));
      await page.click("Save check-in");
      await page.wait("!globalThis.__q('dialog')&&!!globalThis.__q('.entries-table tbody tr')");
      let saved = await userExperiment(secondId);
      assert.equal(saved.entries.length, 1);
      assert.equal(saved.entries[0].habitStatus, "done");
      assert.equal(saved.entries[0].values.mood, 6);
      assert.equal(saved.entries[0].values.energy, undefined);
      assert.equal(saved.entries[0].observedDate, expectedLocal);
      assert.ok(saved.entries[0].recordedAt);
      assert.equal(saved.entries[0].updatedAt, null);
      await page.evaluate(
        "globalThis.Date=globalThis.__OriginalDate;window.dispatchEvent(new Event('focus'))",
      );
      await page.wait("globalThis.__q('.detail-progress-card h2')?.textContent==='Day 1 of 14'");
      await page.click("Edit check-in");
      await page.dialogOpen();
      assert.equal(
        await page.evaluate("globalThis.__q('#entry-note').value"),
        "A day worth remembering",
      );
      await page.evaluate("globalThis.__q('input[name=habitStatus][value=not_done]').click()");
      await page.score("mood", 8);
      await page.fill("#entry-note", "Edited once");
      await page.click("Save check-in");
      await page.wait("!globalThis.__q('dialog')");
      saved = await userExperiment(secondId);
      assert.equal(saved.entries.length, 1);
      assert.equal(saved.entries[0].habitStatus, "not_done");
      assert.equal(saved.entries[0].values.mood, 8);
      await page.click("Edit check-in");
      await page.dialogOpen();
      await page.fill("#entry-note", "Kept after a failed save");
      await page.evaluate(
        "Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError')}",
      );
      await page.click("Save check-in");
      await page.wait(
        "globalThis.__q('dialog [role=alert]')?.textContent.includes('Could not save')",
      );
      assert.equal(
        await page.evaluate("globalThis.__q('#entry-note').value"),
        "Kept after a failed save",
      );
      assert.equal((await userExperiment(secondId)).entries[0].note, "Edited once");
      await page.evaluate("Storage.prototype.setItem=globalThis.__originalSetItem");
      await page.click("Save check-in");
      await page.wait("!globalThis.__q('dialog')");
      await navigate(`/experiments/${secondId}`, "Second browser experiment");
      assert.ok(
        await page.evaluate(
          "globalThis.__q('.entries-table').textContent.includes('Kept after a failed save')",
        ),
      );
      assert.equal((await userExperiment(secondId)).entries.length, 1);
      await navigate(`/experiments/${firstId}`, "First browser experiment");
      assert.equal((await userExperiment(firstId)).entries.length, 0);
      assert.ok(
        await page.evaluate(
          "document.body.textContent.includes('Not enough observations to compare yet.')",
        ),
      );
      await page.click("How was this calculated?", "summary");
      assert.ok(
        await page.evaluate(
          "globalThis.__q('.calculation-details').textContent.includes('0 done days · 0 not-done days')",
        ),
      );
      await navigate("/experiments/new", "Start with curiosity");
      await page.fill("#experiment-title", "An abandoned draft");
      await page.click("Experiments", ".nav-link");
      await page.wait("!!globalThis.__q('.filter-tabs')");
      await page.click("New experiment", "a");
      await page.wait("!!globalThis.__q('#experiment-title')");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-title').value"), "");
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      for (const [route, heading] of [
        ["/dashboard", "Hello, curious mind"],
        ["/experiments", "My experiments"],
        ["/experiments/new", "Start with curiosity"],
        [`/experiments/${secondId}`, "Second browser experiment"],
      ]) {
        await navigate(route, heading);
        assert.ok(
          await page.evaluate("document.documentElement.scrollWidth<=window.innerWidth"),
          `Mobile overflow: ${route}`,
        );
        assert.equal(await page.evaluate("/[А-Яа-яЁё]/.test(document.body.textContent)"), false);
      }
      await page.screenshot(join(profile, "details-mobile.png"));
      await page.click("Edit check-in");
      await page.dialogOpen();
      await page.screenshot(join(profile, "check-in-mobile.png"));
      await page.key("Escape", 27);
      await page.wait("!globalThis.__q('dialog')");
      const backup = await page.evaluate<string>("localStorage.getItem('self-lab:experiments')");
      await page.evaluate("localStorage.setItem('self-lab:experiments','invalid JSON')");
      await navigate("/dashboard", "Local storage needs attention");
      assert.equal(
        await page.evaluate("localStorage.getItem('self-lab:experiments')"),
        "invalid JSON",
      );
      await page.evaluate(`localStorage.setItem('self-lab:experiments',${JSON.stringify(backup)})`);
      await page.click("Retry loading");
      await page.wait("globalThis.__q('h1')?.textContent.includes('Hello, curious mind')");
      assert.equal(page.errors.length, 0, page.errors.join("\n"));
      console.log(`Browser screenshots: ${profile}`);
    } finally {
      browser?.close();
      chrome.kill("SIGTERM");
      chrome.stderr.destroy();
      server?.kill("SIGTERM");
      server?.stdout.destroy();
      server?.stderr.destroy();
    }
  },
);
