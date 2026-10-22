import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Select } from "../src/components/ui/select";
import { selectKeyboardAction } from "../src/components/ui/select-keyboard";

test("custom select supports keyboard opening, movement, selection, and dismissal", () => {
  const closed = { open: false, activeIndex: 1 };
  for (const key of ["Enter", " ", "ArrowDown", "ArrowUp"])
    assert.deepEqual(selectKeyboardAction(key, closed, 3)?.state, {
      open: true,
      activeIndex: 1,
    });
  const opened = { open: true, activeIndex: 1 };
  assert.equal(selectKeyboardAction("ArrowDown", opened, 3)?.state.activeIndex, 2);
  assert.equal(
    selectKeyboardAction("ArrowDown", { open: true, activeIndex: 2 }, 3)?.state.activeIndex,
    0,
  );
  assert.equal(
    selectKeyboardAction("ArrowUp", { open: true, activeIndex: 0 }, 3)?.state.activeIndex,
    2,
  );
  assert.equal(selectKeyboardAction("Home", opened, 3)?.state.activeIndex, 0);
  assert.equal(selectKeyboardAction("End", opened, 3)?.state.activeIndex, 2);
  assert.deepEqual(selectKeyboardAction("Enter", opened, 3), {
    state: closed,
    commit: true,
    focusTrigger: true,
  });
  assert.deepEqual(selectKeyboardAction("Escape", opened, 3), {
    state: closed,
    commit: false,
    focusTrigger: true,
  });
  assert.deepEqual(selectKeyboardAction("Tab", opened, 3), {
    state: closed,
    commit: false,
    focusTrigger: false,
  });
  assert.equal(selectKeyboardAction("x", opened, 3), null);
});

test("custom select exposes its label, selected value, and listbox relationship", () => {
  const html = renderToStaticMarkup(
    createElement(Select, {
      id: "test-measure",
      label: "Daily measure",
      value: "focus",
      options: [
        { value: "mood", label: "Mood" },
        { value: "focus", label: "Focus" },
      ],
      onChange: () => undefined,
    }),
  );
  assert.match(html, /id="test-measure-label"[^>]*>Daily measure/);
  assert.match(html, /aria-haspopup="listbox"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /id="test-measure-value"[^>]*>Focus/);
  assert.doesNotMatch(html, /<select/);
});
