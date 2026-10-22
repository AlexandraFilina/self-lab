import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckInSummary } from "../src/features/dashboard/components/todays-check-ins";
import { t } from "../src/i18n";

test("check-in summary is readable status text without checkbox iconography", () => {
  const html = renderToStaticMarkup(createElement(CheckInSummary, { checkedIn: 3, total: 4 }));
  assert.ok(html.includes(t.dailyWorkflow.summary(3, 4)));
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /<svg|<button|role="checkbox"|aria-checked/);
  assert.equal(renderToStaticMarkup(createElement(CheckInSummary, { checkedIn: 0, total: 0 })), "");
});
