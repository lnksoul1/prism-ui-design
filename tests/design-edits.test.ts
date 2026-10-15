/**
 * Preview write-back: the batch op vocabulary, and the annotation the edit layer
 * needs to identify a component in the rendered artifact.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdits } from "../src/tools/design-edits.js";
import { addComponent, initProject } from "../src/service/design-service.js";
import { componentToHTML, exportDesign } from "../src/tools/design-tools.js";
import { previewEditorHTML } from "../src/tools/preview-editor.js";
import { stateStore } from "../src/state.js";

function addHero(title: string): string {
  const node = addComponent("hero", undefined, { title, subtitle: "sub" }, null);
  return node.id;
}

test("set_props merges props and reports success", () => {
  initProject("preview edits");
  const id = addHero("Original");
  const [outcome] = applyEdits([{ op: "set_props", id, props: { title: "手改标题" } }]);
  assert.equal(outcome.ok, true);
  const node = stateStore.getState().components.find((c) => c.id === id);
  assert.equal(node?.props.title, "手改标题");
});

test("one bad edit does not discard the rest of the batch", () => {
  initProject("preview edits");
  const id = addHero("keep");
  const outcomes = applyEdits([
    { op: "set_props", id: "comp_missing", props: { title: "x" } },
    { op: "set_props", id, props: { subtitle: "changed" } },
  ]);
  assert.equal(outcomes.length, 2);
  assert.equal(outcomes[0].ok, false);
  assert.match(String(outcomes[0].detail), /unknown component/);
  assert.equal(outcomes[1].ok, true);
});

test("unknown ops, bad categories and missing fields fail with a reason", () => {
  initProject("preview edits");
  const id = addHero("keep");
  const outcomes = applyEdits([
    { op: "bogus" } as never,
    { op: "set_token", category: "nope", key: "k", value: "v" },
    { op: "move", id },
    { op: "remove" },
  ]);
  assert.deepEqual(
    outcomes.map((o) => o.ok),
    [false, false, false, false]
  );
  assert.match(String(outcomes[0].detail), /unknown op/);
  assert.match(String(outcomes[1].detail), /unknown token category/);
  assert.match(String(outcomes[2].detail), /needs `id` and either/);
});

test("move, reparent and remove reach the design service", () => {
  initProject("preview edits");
  const first = addHero("first");
  const second = addHero("second");
  const container = addComponent("container", undefined, { title: "box" }, null).id;

  assert.equal(applyEdits([{ op: "move", id: first, after: second }])[0].ok, true);
  assert.equal(
    stateStore.getState().components.map((c) => c.id).indexOf(second) <
      stateStore.getState().components.map((c) => c.id).indexOf(first),
    true
  );

  assert.equal(applyEdits([{ op: "reparent", id: first, parentId: container }])[0].ok, true);
  const containerNode = stateStore.getState().components.find((c) => c.id === container);
  assert.equal(
    containerNode?.children.some((c) => c.id === first),
    true
  );
  assert.equal(
    stateStore.getState().components.some((c) => c.id === first),
    false
  );

  assert.equal(applyEdits([{ op: "remove", id: second }])[0].ok, true);
  assert.equal(
    stateStore.getState().components.some((c) => c.id === second),
    false
  );
});

test("set_token updates a token, and undo takes an edit back", () => {
  initProject("preview edits");
  const id = addHero("before");
  assert.equal(
    applyEdits([{ op: "set_token", category: "colors", key: "color-primary", value: "#ff0055" }])[0].ok,
    true
  );
  assert.equal(stateStore.getState().tokens.colors["color-primary"]?.value, "#ff0055");

  applyEdits([{ op: "set_props", id, props: { title: "after" } }]);
  assert.equal(applyEdits([{ op: "undo" }])[0].ok, true);
  const node = stateStore.getState().components.find((c) => c.id === id);
  assert.equal(node?.props.title, "before");
});

test("annotated rendering stamps identity, exports stay clean", () => {
  initProject("preview edits");
  const id = addHero("Annotated");
  const node = stateStore.getState().components.find((c) => c.id === id)!;

  const annotated = componentToHTML(node, true);
  assert.match(annotated, new RegExp(`data-prism-id="${id}"`));
  assert.match(annotated, /data-prism-type="hero"/);
  assert.match(annotated, /data-prism-props="[^"]*Annotated/);

  const clean = componentToHTML(node);
  assert.doesNotMatch(clean, /data-prism-id/);

  const exported = exportDesign("html");
  assert.doesNotMatch(exported, /data-prism-id/);
  assert.doesNotMatch(exported, /prism-preview-editor/);
});

test("the injected editor is inert outside a frame", () => {
  const editor = previewEditorHTML();
  assert.match(editor, /prism-preview-editor/);
  assert.match(editor, /window\.parent === window/);
  assert.match(editor, /postMessage/);
  assert.doesNotMatch(editor, /http:\/\/|https:\/\//);
});
