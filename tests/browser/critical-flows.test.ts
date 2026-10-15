import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildExperiment } from "../../src/features/experiments/model/actions";
import { builtInMetric } from "../../src/features/experiments/model/metrics";
import { adaptLegacyExperiment } from "../../src/features/experiments/data/migration";
import { LEGACY_EXPERIMENTS } from "../../src/features/experiments/data/legacy-experiments";
import { addDays } from "../../src/lib/dates";
import type { Experiment, CustomMetricId } from "../../src/features/experiments/model/types";

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
  "critical browser flows: onboarding, check-ins, results, lifecycle, reload, and responsive UI",
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
      const onboardingHeading = "What would you like to understand about yourself?";
      await navigate("/dashboard", onboardingHeading);
      const pristine = await workspace();
      await page.evaluate(
        "localStorage.setItem('self-lab:experiments',JSON.stringify({version:5,experiments:[]}))",
      );
      await navigate("/dashboard", onboardingHeading);
      assert.equal((await workspace()).experiments.length, 0);
      assert.equal(await page.evaluate("globalThis.__qa('.stat-card').length"), 0);
      await page.evaluate(
        `localStorage.setItem('self-lab:experiments',${JSON.stringify(JSON.stringify(pristine))})`,
      );
      await navigate("/dashboard", onboardingHeading);
      assert.equal(
        await page.evaluate("globalThis.__q('#onboarding-experiment-question').value"),
        "",
      );
      assert.equal(
        await page.evaluate("globalThis.__qa('#onboarding-experiment-title').length"),
        0,
      );
      assert.equal(await page.evaluate("globalThis.__qa('input[name=metrics]:checked').length"), 0);
      await page.screenshot(join(profile, "onboarding-desktop.png"));
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      assert.ok(await page.evaluate("document.documentElement.scrollWidth<=window.innerWidth"));
      await page.screenshot(join(profile, "onboarding-mobile.png"));
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: 1440,
        height: 1100,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.click("Experiments", ".nav-link");
      await page.wait("!!globalThis.__q('.filter-tabs')");
      await page.click("New experiment", "a");
      await page.wait("!!globalThis.__q('#experiment-question')");
      assert.ok(
        await page.evaluate(
          "(()=>{const ids=[...document.querySelectorAll('form [id]')].map(e=>e.id);return new Set(ids).size===ids.length})()",
        ),
      );
      await page.click("Your question", "label");
      assert.ok(
        await page.evaluate("document.activeElement===globalThis.__q('#experiment-question')"),
      );
      await page.click("Dashboard", ".nav-link");
      await page.wait(`globalThis.__q('h1')?.textContent===${JSON.stringify(onboardingHeading)}`);
      await page.click("Continue");
      await page.wait(
        "globalThis.__q('form [role=alert]')?.textContent==='Your question is required.'",
      );
      assert.equal(
        (await workspace()).experiments.filter((item) => item.source === "user").length,
        0,
      );
      await page.fill(
        "#onboarding-experiment-question",
        "How does reading before bed relate to my sleep?",
      );
      await page.click("Continue");
      await page.wait("!!globalThis.__q('#onboarding-experiment-title')");
      assert.equal(await page.evaluate("globalThis.__q('#onboarding-experiment-title').value"), "");
      assert.equal(await page.evaluate("globalThis.__q('#onboarding-experiment-habit').value"), "");
      assert.equal(await page.evaluate("globalThis.__qa('input[name=metrics]:checked').length"), 0);
      await page.fill("#onboarding-experiment-title", "First onboarding experiment");
      await page.fill("#onboarding-experiment-habit", "Read before bed");
      await page.click("Create experiment");
      await page.wait(
        "globalThis.__q('form [role=alert]')?.textContent==='Choose at least one metric to track.'",
      );
      await page.evaluate("globalThis.__q('input[name=metrics][value=sleep]').click()");
      await page.click("+ Add custom metric");
      await page.fill("#onboarding-custom-metric-name", "Restfulness");
      await page.click("Add metric");
      await page.fill("#onboarding-duration-days", "21");
      await page.click("Create experiment");
      await page.wait("globalThis.__q('h1')?.textContent==='First onboarding experiment'");
      const onboardingId = (await page.evaluate<string>("location.pathname")).split("/").at(-1);
      assert.ok(onboardingId);
      const onboarded = await userExperiment(onboardingId);
      assert.equal(onboarded.status, "active");
      assert.equal(onboarded.source, "user");
      assert.equal(onboarded.entries.length, 0);
      assert.equal(onboarded.durationDays, 21);
      assert.ok(onboarded.metrics.some((metric) => metric.id === "sleep"));
      assert.ok(
        onboarded.metrics.some(
          (metric) => metric.kind === "custom" && metric.label === "Restfulness",
        ),
      );
      assert.ok(
        await page.evaluate(
          "globalThis.__qa('.detail-actions button').some(e=>e.textContent.trim()==='Check in today')",
        ),
      );
      assert.ok(
        await page.evaluate(
          "globalThis.__q('.detail-progress-card').textContent.includes('Start observing today')",
        ),
      );
      await navigate(`/experiments/${onboardingId}`, "First onboarding experiment");
      assert.deepEqual(await userExperiment(onboardingId), onboarded);
      await navigate("/dashboard", "Hello, curious mind");
      assert.equal(
        await page.evaluate("globalThis.__qa('#onboarding-experiment-question').length"),
        0,
      );
      await navigate("/experiments", "My experiments");
      const onboardingActive = await page.evaluate<string>(
        "globalThis.__qa('.filter-tab').find(e=>e.textContent.startsWith('In progress')).textContent",
      );
      await page.click(onboardingActive, ".filter-tab");
      assert.ok(
        await page.evaluate(
          `globalThis.__qa('.experiment-card h2 a').some(e=>e.getAttribute('href')==='/experiments/${onboardingId}')`,
        ),
      );
      await navigate("/experiments/new", "Start with curiosity");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-question').value"), "");
      await page.click("Coffee & sleep", ".idea-grid button");
      assert.equal(
        await page.evaluate("globalThis.__q('#experiment-question').value"),
        "Does coffee after lunch affect how I sleep?",
      );
      await page.click("Continue");
      await page.wait("!!globalThis.__q('#experiment-title')");
      assert.equal(
        await page.evaluate("globalThis.__q('#experiment-title').value"),
        "Afternoon coffee and sleep",
      );
      assert.equal(
        await page.evaluate("globalThis.__q('#experiment-habit').value"),
        "Avoid coffee after lunch",
      );
      assert.equal(
        await page.evaluate("globalThis.__q('input[name=metrics][value=sleep]').checked"),
        true,
      );
      await page.fill("#experiment-title", "Edited idea experiment");
      await page.fill("#experiment-question", "How does my afternoon routine relate to sleep?");
      await page.fill("#experiment-habit", "Choose decaf after lunch");
      await page.fill("#duration-days", "28");
      await page.click("Back to question");
      await page.wait("!!globalThis.__q('.idea-grid')");
      assert.equal(
        await page.evaluate("globalThis.__q('#experiment-question').value"),
        "How does my afternoon routine relate to sleep?",
      );
      await page.click("Continue");
      await page.wait("!!globalThis.__q('#experiment-title')");
      assert.equal(
        await page.evaluate("globalThis.__q('#experiment-title').value"),
        "Edited idea experiment",
      );
      assert.equal(await page.evaluate("globalThis.__q('#duration-days').value"), "28");
      await page.click("Create experiment");
      await page.wait("globalThis.__q('h1')?.textContent==='Edited idea experiment'");
      const ideaId = (await page.evaluate<string>("location.pathname")).split("/").at(-1);
      assert.ok(ideaId);
      const editedIdea = await userExperiment(ideaId);
      assert.equal(editedIdea.habit, "Choose decaf after lunch");
      assert.equal(editedIdea.question, "How does my afternoon routine relate to sleep?");
      assert.equal(editedIdea.durationDays, 28);
      assert.equal(editedIdea.entries.length, 0);
      await navigate(`/experiments/${ideaId}`, "Edited idea experiment");
      assert.deepEqual(await userExperiment(ideaId), editedIdea);
      await page.evaluate(
        `localStorage.setItem('self-lab:experiments',${JSON.stringify(JSON.stringify(pristine))})`,
      );
      await navigate("/dashboard", onboardingHeading);
      assert.equal(await page.evaluate("document.documentElement.lang"), "en");
      assert.equal(await page.evaluate("/[А-Яа-яЁё]/.test(document.body.textContent)"), false);
      await page.screenshot(join(profile, "dashboard-desktop.png"));
      const yesterdayDate = await page.evaluate<string>(
        "(()=>{const d=new Date();d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})()",
      );
      const initial = await workspace();
      assert.deepEqual(
        initial.experiments.map((item) => item.id),
        ["morning-walk-completed"],
      );
      initial.experiments.push(...LEGACY_EXPERIMENTS.map((item) => adaptLegacyExperiment(item)));
      await page.evaluate(
        `localStorage.setItem('self-lab:experiments',${JSON.stringify(JSON.stringify(initial))})`,
      );
      await navigate("/dashboard", onboardingHeading);
      assert.deepEqual(
        (await workspace()).experiments.map((item) => item.id),
        ["morning-walk-completed"],
      );
      await navigate("/experiments", "My experiments");
      assert.equal(await page.evaluate("globalThis.__qa('.experiment-card').length"), 1);
      await navigate("/experiments/morning-walk", "Experiment not found");
      const seed = buildExperiment(
        {
          title: "Browser check-in experiment",
          question: "How do walks relate to mood?",
          habit: "Take a short walk",
          durationDays: 28,
          metrics: [builtInMetric("mood"), builtInMetric("energy")],
        },
        "browser-active",
        addDays(yesterdayDate, -13),
      );
      const withActive = await workspace();
      withActive.experiments.unshift(seed);
      await page.evaluate(
        `localStorage.setItem('self-lab:experiments',${JSON.stringify(JSON.stringify(withActive))})`,
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
      const sampleId = "browser-active";
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
      await page.wait("!!globalThis.__q('#experiment-question')");
      await page.fill("#experiment-question", "Do walks relate to my mood?");
      await page.click("Continue");
      await page.wait("!!globalThis.__q('#experiment-title')");
      await page.click("Create experiment");
      await page.wait(
        "globalThis.__q('form [role=alert]')?.textContent.includes('Experiment name is required')",
      );
      await page.fill("#experiment-title", "First browser experiment");
      await page.fill("#experiment-question", "Do walks relate to my mood?");
      await page.fill("#experiment-habit", "Walk for 20 minutes");
      assert.equal(await page.evaluate("globalThis.__qa('input[name=metrics]:checked').length"), 0);
      await page.click("Create experiment");
      await page.wait(
        "globalThis.__q('form [role=alert]')?.textContent==='Choose at least one metric to track.'",
      );
      await page.evaluate("globalThis.__q('input[name=metrics][value=mood]').click()");
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
      await page.wait("!!globalThis.__q('#experiment-question')");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-question').value"), "");
      assert.equal(await page.evaluate("globalThis.__qa('#experiment-title').length"), 0);
      await page.fill("#experiment-question", "How does this habit relate to energy?");
      await page.click("Continue");
      await page.wait("!!globalThis.__q('#experiment-title')");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-title').value"), "");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-habit').value"), "");
      assert.equal(await page.evaluate("globalThis.__q('#duration-days').value"), "14");
      assert.equal(await page.evaluate("globalThis.__qa('input[name=metrics]:checked').length"), 0);
      await page.fill("#experiment-title", "Second browser experiment");
      await page.fill("#experiment-question", "How does this habit relate to energy?");
      await page.fill("#experiment-habit", "Take a short walk");
      await page.evaluate("globalThis.__q('input[name=metrics][value=energy]').click()");
      await page.evaluate("globalThis.__q('input[name=metrics][value=mood]').click()");
      await page.click("+ Add custom metric");
      await page.click("Add metric");
      await page.wait(
        "globalThis.__q('.custom-metric-editor [role=alert]')?.textContent.includes('Enter a name')",
      );
      await page.fill("#custom-metric-name", "  Focus  ");
      await page.click("Add metric");
      await page.wait("!!globalThis.__q('[data-custom-metric-id]')");
      const focusId = await page.evaluate<CustomMetricId>(
        "globalThis.__q('[data-custom-metric-id]').dataset.customMetricId",
      );
      assert.match(focusId, /^custom_[a-f0-9-]+$/);
      await page.click("+ Add custom metric");
      await page.fill("#custom-metric-name", " fOcUs ");
      await page.click("Add metric");
      await page.wait(
        "globalThis.__q('.custom-metric-editor [role=alert]')?.textContent.includes('already selected')",
      );
      assert.equal(await page.evaluate("globalThis.__qa('[data-custom-metric-id]').length"), 1);
      await page.click("Cancel", ".custom-metric-editor button");
      await page.click("+ Add custom metric");
      await page.fill("#custom-metric-name", "Temporary");
      await page.click("Add metric");
      await page.wait("globalThis.__qa('[data-custom-metric-id]').length===2");
      await page.click("", "button[aria-label='Remove Temporary']");
      assert.equal(await page.evaluate("globalThis.__qa('[data-custom-metric-id]').length"), 1);
      await page.click("+ Add custom metric");
      await page.fill("#custom-metric-name", "X".repeat(40));
      await page.click("Add metric");
      await page.screenshot(join(profile, "custom-metric-form.png"));

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
        2,
      );
      assert.equal(
        await page.evaluate("globalThis.__q('[data-custom-metric-id]').dataset.customMetricId"),
        focusId,
      );
      await page.evaluate("Storage.prototype.setItem=globalThis.__originalSetItem");
      await page.click("Create experiment");
      await page.wait("globalThis.__q('h1')?.textContent==='Second browser experiment'");
      const secondId = (await page.evaluate<string>("location.pathname")).split("/").at(-1);
      assert.ok(secondId);
      assert.notEqual(firstId, secondId);
      assert.equal(
        (await workspace()).experiments.filter((item) => item.source === "user").length,
        3,
      );
      assert.ok(
        (await userExperiment(secondId)).metrics.some(
          (metric) => metric.id === focusId && metric.kind === "custom" && metric.label === "Focus",
        ),
      );
      await page.click("Check in today");
      await page.dialogOpen();
      assert.equal(
        await page.evaluate(`globalThis.__q('label[for="score-${focusId}"]').textContent`),
        "Focus",
      );
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
      await page.score(focusId, 7);
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
      assert.equal(saved.entries[0].values[focusId], 7);
      assert.equal(await page.evaluate("globalThis.__qa('.metric-chart path').length"), 0);
      assert.ok(
        await page.evaluate(
          "globalThis.__q('.chart-container').textContent.includes('1 observation recorded. Add more check-ins to see a trend.')",
        ),
      );
      assert.ok(
        await page.evaluate("globalThis.__q('.entries-table').textContent.includes('Focus')"),
      );
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
      assert.equal((await userExperiment(secondId)).entries[0].values[focusId], 7);
      assert.ok((await userExperiment(secondId)).metrics.some((metric) => metric.id === focusId));
      assert.equal((await userExperiment(secondId)).entries.length, 1);
      await page.click("Edit check-in");
      await page.dialogOpen();
      assert.ok(await page.evaluate(`globalThis.__q('#score-${focusId}').value==='7'`));
      await page.click("Cancel");
      await page.wait("!globalThis.__q('dialog')");
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
      assert.equal(await page.evaluate("globalThis.__q('#experiment-question').value"), "");
      await page.fill("#experiment-question", "An abandoned question");
      await page.click("Continue");
      await page.wait("!!globalThis.__q('#experiment-title')");
      assert.equal(await page.evaluate("globalThis.__qa('input[name=metrics]:checked').length"), 0);
      assert.equal(await page.evaluate("globalThis.__qa('[data-custom-metric-id]').length"), 0);
      await page.fill("#experiment-title", "An abandoned draft");
      await page.click("+ Add custom metric");
      await page.fill("#custom-metric-name", "Abandoned metric");
      await page.click("Add metric");

      await page.click("Experiments", ".nav-link");
      await page.wait("!!globalThis.__q('.filter-tabs')");
      await page.click("New experiment", "a");
      await page.wait("!!globalThis.__q('#experiment-question')");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-question').value"), "");
      await page.fill("#experiment-question", "A fresh question");
      await page.click("Continue");
      await page.wait("!!globalThis.__q('#experiment-title')");
      assert.equal(await page.evaluate("globalThis.__q('#experiment-title').value"), "");
      assert.equal(await page.evaluate("globalThis.__qa('[data-custom-metric-id]').length"), 0);
      assert.equal(await page.evaluate("globalThis.__qa('input[name=metrics]:checked').length"), 0);

      const completedId = "morning-walk-completed";
      const completedTitle = "Morning walks, mood, and productivity";
      await navigate("/experiments", "My experiments");
      const completedFilter = await page.evaluate<string>(
        "globalThis.__qa('.filter-tab').find(e=>e.textContent.startsWith('Completed')).textContent",
      );
      await page.click(completedFilter, ".filter-tab");
      await page.wait("globalThis.__q('.filter-selected')?.textContent.startsWith('Completed')");
      assert.equal(
        await page.evaluate("globalThis.__q('.experiment-card h2 a').textContent"),
        completedTitle,
      );
      await page.click(completedTitle, ".experiment-card h2 a");
      await page.wait(`globalThis.__q('h1')?.textContent===${JSON.stringify(completedTitle)}`);
      for (let reload = 0; reload < 2; reload++) {
        if (reload) await navigate(`/experiments/${completedId}`, completedTitle);
        assert.equal(await page.evaluate("globalThis.__qa('.metric-result').length"), 2);
        assert.equal(
          await page.evaluate(
            "globalThis.__q('[data-metric-id=mood] .result-percentage').textContent",
          ),
          "+24%",
        );
        assert.equal(
          await page.evaluate(
            "globalThis.__q('[data-metric-id=productivity] .result-message').textContent",
          ),
          "No clear difference",
        );
        assert.ok(
          await page.evaluate(
            "globalThis.__qa('.data-strength').every(e=>e.textContent==='Early pattern')",
          ),
        );
        assert.ok(
          await page.evaluate(
            "globalThis.__q('.comparison-card').textContent.includes('13 done days · 8 not-done days')",
          ),
        );
        assert.ok(
          await page.evaluate(
            "globalThis.__q('.insight-note').textContent.includes('not proof that the habit caused the difference')",
          ),
        );
        assert.equal(await page.evaluate("globalThis.__q('.observations-disclosure').open"), false);
        assert.equal(await page.evaluate("globalThis.__qa('.entries-table tbody tr').length"), 0);
        assert.equal(await page.evaluate("globalThis.__qa('.legacy-disclosure').length"), 0);
      }
      await page.evaluate("globalThis.__q('.comparison-card').scrollIntoView({block:'start'})");
      await page.screenshot(join(profile, "completed-results-desktop.png"));
      assert.ok(
        await page.evaluate("globalThis.__qa('.metric-chart path[data-segment=dashed]').length>0"),
      );
      assert.ok(
        await page.evaluate(
          "globalThis.__q('.chart-container').textContent.includes('Dashed lines cross days with no recorded score.')",
        ),
      );
      await page.click("How was this calculated?", "summary");
      for (const text of [
        "7 days without a check-in",
        "7.3 / 10",
        "5.9 / 10",
        "not statistical confidence",
      ])
        assert.ok(
          await page.evaluate(
            `globalThis.__q('.calculation-details').textContent.includes(${JSON.stringify(text)})`,
          ),
          text,
        );
      await page.click("View 21 daily observations", "summary");
      assert.equal(await page.evaluate("globalThis.__qa('.entries-table tbody tr').length"), 21);
      await page.click("View 21 daily observations", "summary");
      assert.equal(await page.evaluate("globalThis.__qa('.entries-table tbody tr').length"), 0);
      await page.click("View 21 daily observations", "summary");
      await page.click("← Back to experiments", "a");
      await page.wait("!!globalThis.__q('.experiments-grid')");
      await page.click(completedTitle, ".experiment-card h2 a");
      await page.wait(`globalThis.__q('h1')?.textContent===${JSON.stringify(completedTitle)}`);
      assert.equal(await page.evaluate("globalThis.__q('.observations-disclosure').open"), false);
      await page.click("View 21 daily observations", "summary");
      const completedBefore = await userExperiment(completedId);
      const editedDate = await page.evaluate<string>(
        "globalThis.__q('.entries-table tbody time').dateTime",
      );
      const originalEntry = completedBefore.entries.find(
        (entry) => entry.observedDate === editedDate,
      );
      assert.ok(originalEntry);
      await page.click("Edit", ".entries-table tbody tr:first-child button");
      await page.dialogOpen();
      await page.fill("#entry-note", "Completed observation edited without duplication");
      await page.click("Save check-in");
      await page.wait("!globalThis.__q('dialog')");
      await navigate(`/experiments/${completedId}`, completedTitle);
      const completedAfter = await userExperiment(completedId);
      assert.equal(completedAfter.entries.length, 21);
      const completedEdit = completedAfter.entries.find(
        (entry) => entry.observedDate === editedDate,
      );
      assert.equal(completedEdit?.id, originalEntry.id);
      assert.equal(completedEdit?.note, "Completed observation edited without duplication");
      assert.ok(completedEdit?.updatedAt);
      assert.equal(await page.evaluate("globalThis.__q('.observations-disclosure').open"), false);
      assert.equal(
        await page.evaluate(
          "globalThis.__q('[data-metric-id=mood] .result-percentage').textContent",
        ),
        "+24%",
      );

      await navigate(`/experiments/${secondId}`, "Second browser experiment");
      const beforeFinish = await userExperiment(secondId);
      await page.click("Finish experiment");
      await page.dialogOpen();
      await page.screenshot(join(profile, "finish-experiment-desktop.png"));
      assert.equal(
        await page.evaluate("globalThis.__q('dialog h2').textContent"),
        "Finish this experiment?",
      );
      assert.ok(
        await page.evaluate(
          "globalThis.__q('dialog').textContent.includes('even if the planned observation window is not complete')",
        ),
      );
      await page.click("Keep observing", "dialog button");
      await page.wait("!globalThis.__q('dialog')");
      assert.equal((await userExperiment(secondId)).status, "active");
      await page.click("Finish experiment");
      await page.dialogOpen();
      assert.ok(
        await page.evaluate(
          "globalThis.__q('dialog').textContent.includes('1 recorded observation')",
        ),
      );
      assert.ok(
        await page.evaluate(
          "globalThis.__q('dialog').textContent.includes('0 done days · 1 not-done day')",
        ),
      );
      await page.evaluate(
        "globalThis.__lifecycleWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError')}",
      );
      await page.click("Finish & view results", "dialog button");
      await page.wait(
        "globalThis.__q('dialog [role=alert]')?.textContent.includes('Could not save')",
      );
      assert.equal((await userExperiment(secondId)).status, "active");
      await page.evaluate("Storage.prototype.setItem=globalThis.__lifecycleWrite");
      await page.click("Finish & view results", "dialog button");
      await page.wait("!globalThis.__q('dialog')&&location.hash==='#results'");
      const finished = await userExperiment(secondId);
      assert.equal(finished.status, "completed");
      assert.ok(finished.completedAt);
      assert.deepEqual(finished.entries, beforeFinish.entries);
      assert.ok(
        await page.evaluate(
          "globalThis.__q('.comparison-card').textContent.includes('Not enough observations to compare yet.')",
        ),
      );
      assert.equal(await page.evaluate("globalThis.__q('.observations-disclosure').open"), false);
      await navigate(`/experiments/${secondId}`, "Second browser experiment");
      assert.equal((await userExperiment(secondId)).status, "completed");
      assert.equal((await userExperiment(secondId)).completedAt, finished.completedAt);
      assert.equal(
        await page.evaluate("globalThis.__q('.status-badge').textContent.trim()"),
        "Completed",
      );
      await navigate("/experiments", "My experiments");
      const activeFilter = await page.evaluate<string>(
        "globalThis.__qa('.filter-tab').find(e=>e.textContent.startsWith('In progress')).textContent",
      );
      await page.click(activeFilter, ".filter-tab");
      assert.equal(
        await page.evaluate(
          `globalThis.__qa('.experiment-card h2 a').some(e=>e.getAttribute('href')==='/experiments/${secondId}')`,
        ),
        false,
      );
      const finishedFilter = await page.evaluate<string>(
        "globalThis.__qa('.filter-tab').find(e=>e.textContent.startsWith('Completed')).textContent",
      );
      await page.click(finishedFilter, ".filter-tab");
      assert.ok(
        await page.evaluate(
          `globalThis.__qa('.experiment-card h2 a').some(e=>e.getAttribute('href')==='/experiments/${secondId}')`,
        ),
      );
      await navigate("/dashboard", "Hello, curious mind");
      assert.equal(
        await page.evaluate(
          "globalThis.__qa('.stat-value').map(e=>e.firstChild.textContent).join(',')",
        ),
        "2,23,2",
      );
      await navigate(`/experiments/${secondId}`, "Second browser experiment");
      await page.click("Reopen experiment");
      await page.wait("globalThis.__q('.status-badge')?.textContent.trim()==='In progress'");
      await navigate(`/experiments/${secondId}`, "Second browser experiment");
      const reopened = await userExperiment(secondId);
      assert.equal(reopened.status, "active");
      assert.equal(reopened.completedAt, null);
      assert.deepEqual(reopened.entries, beforeFinish.entries);
      assert.equal(await page.evaluate("globalThis.__qa('.entries-table tbody tr').length"), 1);

      const targetWorkspace = await workspace();
      const expired = targetWorkspace.experiments.find((item) => item.id === "browser-active");
      assert.ok(expired);
      expired.durationDays = 14;
      const expiredEntries = structuredClone(expired.entries);
      targetWorkspace.experiments = [
        expired,
        ...targetWorkspace.experiments.filter((item) => item.id !== expired.id),
      ];
      await page.evaluate(
        `localStorage.setItem('self-lab:experiments',${JSON.stringify(JSON.stringify(targetWorkspace))})`,
      );
      await navigate("/dashboard", "Hello, curious mind");
      assert.ok(
        await page.evaluate(
          "globalThis.__q('.lifecycle-card').textContent.includes('Your observation window is complete')",
        ),
      );
      assert.ok(
        await page.evaluate(
          "globalThis.__q('.lifecycle-card').textContent.includes('You recorded 1 of 14 days.')",
        ),
      );
      assert.equal((await userExperiment(expired.id)).status, "active");
      await page.evaluate("globalThis.__q('.lifecycle-card').scrollIntoView({block:'center'})");
      await page.screenshot(join(profile, "observation-target-desktop.png"));
      await page.click("Keep observing");
      await page.dialogOpen();
      await page.screenshot(join(profile, "extend-target-desktop.png"));
      await page.click("+14 days", "dialog button");
      await page.click("+7 days", "dialog button");
      await page.click("Extend observation target", "dialog button");
      await page.wait("!globalThis.__q('dialog')");
      assert.equal((await userExperiment(expired.id)).durationDays, 21);
      assert.deepEqual((await userExperiment(expired.id)).entries, expiredEntries);
      assert.equal((await userExperiment(expired.id)).targetExtensions.length, 1);
      await navigate(`/experiments/${expired.id}`, "Browser check-in experiment");
      await page.evaluate(
        "globalThis.__LifecycleDate=Date;globalThis.Date=class extends globalThis.__LifecycleDate{constructor(...args){super(...(args.length?args:[globalThis.__LifecycleDate.now()+7*86400000]))}};window.dispatchEvent(new Event('focus'))",
      );
      await page.wait("!!globalThis.__q('.lifecycle-card')");
      await page.click("Finish & view results", ".lifecycle-card button");
      await page.dialogOpen();
      await page.click("Finish & view results", "dialog button");
      await page.wait(
        "!globalThis.__q('dialog')&&location.hash==='#results'&&!!globalThis.__q('.observations-disclosure')",
      );
      assert.equal((await userExperiment(expired.id)).status, "completed");
      await page.click("Reopen experiment");
      await page.wait("globalThis.__q('.status-badge')?.textContent.trim()==='In progress'");
      await page.evaluate("window.dispatchEvent(new Event('focus'))");
      await page.wait("!!globalThis.__q('.lifecycle-card')");
      await page.click("Keep observing");
      await page.dialogOpen();
      await page.click("Custom", "dialog button");
      await page.fill("dialog input[name=additionalDays]", "0");
      await page.click("Extend observation target", "dialog button");
      await page.wait(
        "globalThis.__q('dialog [role=alert]')?.textContent.includes('positive whole number')",
      );
      assert.equal((await userExperiment(expired.id)).durationDays, 21);
      await page.fill("dialog input[name=additionalDays]", "2");
      await page.click("Extend observation target", "dialog button");
      await page.wait("!globalThis.__q('dialog')");
      await page.evaluate(
        "globalThis.Date=globalThis.__LifecycleDate;window.dispatchEvent(new Event('focus'))",
      );
      await navigate(`/experiments/${expired.id}`, "Browser check-in experiment");
      const extended = await userExperiment(expired.id);
      assert.equal(extended.durationDays, 23);
      assert.equal(extended.targetExtensions.length, 2);
      assert.deepEqual(extended.entries, expiredEntries);
      assert.equal(extended.status, "active");

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
        [`/experiments/${completedId}`, completedTitle],
        [`/experiments/${secondId}`, "Second browser experiment"],
      ]) {
        await navigate(route, heading);
        assert.ok(
          await page.evaluate("document.documentElement.scrollWidth<=window.innerWidth"),
          `Mobile overflow: ${route}`,
        );
        assert.equal(await page.evaluate("/[А-Яа-яЁё]/.test(document.body.textContent)"), false);
        if (route === `/experiments/${completedId}`) {
          assert.equal(
            await page.evaluate("globalThis.__q('.observations-disclosure').open"),
            false,
          );
          await page.evaluate("globalThis.__q('.comparison-card').scrollIntoView({block:'start'})");
          await page.screenshot(join(profile, "completed-results-mobile.png"));
        }
      }
      await page.screenshot(join(profile, "details-mobile.png"));
      await page.click("Edit check-in");
      await page.dialogOpen();
      assert.ok(
        await page.evaluate(
          "globalThis.__q('dialog').scrollWidth<=globalThis.__q('dialog').clientWidth",
        ),
        "Long custom metric labels must fit the mobile dialog",
      );
      await page.screenshot(join(profile, "check-in-mobile.png"));
      await page.key("Escape", 27);
      await page.wait("!globalThis.__q('dialog')");
      await navigate(`/experiments/${expired.id}`, "Browser check-in experiment");
      await page.evaluate(
        "globalThis.__MobileDate=Date;globalThis.Date=class extends globalThis.__MobileDate{constructor(...args){super(...(args.length?args:[globalThis.__MobileDate.now()+9*86400000]))}};window.dispatchEvent(new Event('focus'))",
      );
      await page.wait("!!globalThis.__q('.lifecycle-card')");
      assert.ok(await page.evaluate("document.documentElement.scrollWidth<=window.innerWidth"));
      await page.click("Keep observing");
      await page.dialogOpen();
      assert.ok(
        await page.evaluate(
          "globalThis.__q('dialog').scrollWidth<=globalThis.__q('dialog').clientWidth",
        ),
      );
      await page.screenshot(join(profile, "extend-target-mobile.png"));
      await page.click("Cancel", "dialog button");
      await page.wait("!globalThis.__q('dialog')");
      await page.evaluate(
        "globalThis.Date=globalThis.__MobileDate;window.dispatchEvent(new Event('focus'))",
      );
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
