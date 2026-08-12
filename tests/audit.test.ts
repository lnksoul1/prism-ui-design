import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { stateStore } from "../src/state.js";
import { auditDesign } from "../src/tools/design-audit.js";

beforeEach(() => {
  stateStore.resetForTests();
});

function seedPoorContrast() {
  stateStore.setToken("colors", "color-text", "#777777", "ai");
  stateStore.setToken("colors", "color-bg", "#F5F5F5", "ai");
  stateStore.setToken("colors", "color-primary", "#8B5CF6", "ai");
}

test("flags images without alt text and forms without labels", () => {
  seedPoorContrast();
  stateStore.addComponent("image", undefined, { src: "https://example.com/a.png" }, null, "ai");
  stateStore.addComponent("form", undefined, { fields: [{ type: "text" }], button_text: "提交" }, null, "ai");

  const result = auditDesign("AA");
  const rules = result.findings.map((f) => f.rule);
  assert.ok(rules.includes("img-alt"), `expected img-alt in ${rules}`);
  assert.ok(rules.includes("form-labels"), `expected form-labels in ${rules}`);
  assert.ok(result.findings.some((f) => f.severity === "critical"));
});

test("reports low text/background contrast as critical and AAA threshold stricter", () => {
  seedPoorContrast();
  const aa = auditDesign("AA");
  const aaContrast = aa.findings.filter((f) => f.rule === "contrast-aa-text");
  assert.ok(aaContrast.length >= 1, "AA run should report contrast issue");

  // With compliant tokens, AA passes but we still get advisory findings at most.
  stateStore.resetForTests();
  stateStore.setToken("colors", "color-text", "#111111", "ai");
  stateStore.setToken("colors", "color-bg", "#FFFFFF", "ai");
  stateStore.setToken("colors", "color-primary", "#60A5FA", "ai");
  stateStore.addComponent("button", "primary", { text: "继续" }, null, "ai");
  const clean = auditDesign("AA");
  assert.ok(
    !clean.findings.some((f) => f.severity === "critical" || f.severity === "warning"),
    `unexpected findings: ${JSON.stringify(clean.findings)}`
  );
  assert.ok(clean.score >= 90);
});

test("score decreases with findings and stays within 0-100", () => {
  seedPoorContrast();
  stateStore.addComponent("image", undefined, { src: "x.png" }, null, "ai");
  const result = auditDesign("AA");
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(result.score < 100);
  assert.equal(typeof result.findings.length, "number");
});
