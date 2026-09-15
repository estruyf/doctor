import test from "node:test";
import assert from "node:assert/strict";

import { CanvasHelper } from "../dist/helpers/CanvasHelper.js";

const MARKDOWN_WEBPART = "1ef5ed11-ce7b-44be-bc5e-4abd55101d16";
const ROLLUP_WEBPART = "daf0b71c-6de8-4ef7-b511-faae7c388708";

const SETTINGS = {
  controlType: 0,
  pageSettingsSlice: { isDefaultDescription: true, isDefaultThumbnail: true },
};

const position = (controlIndex, overrides = {}) => ({
  zoneIndex: 1,
  sectionIndex: 1,
  sectionFactor: 12,
  layoutIndex: 1,
  controlIndex,
  ...overrides,
});

const webPart = (id, title, controlIndex, webPartId = MARKDOWN_WEBPART) => ({
  controlType: 3,
  displayMode: 2,
  id,
  position: position(controlIndex),
  webPartId,
  emphasis: {},
  webPartData: { id: webPartId, instanceId: id, title, properties: {} },
});

const markdown = (title) => ({
  webPartId: MARKDOWN_WEBPART,
  webPartData: { title, properties: {} },
});

const titles = (canvas) =>
  canvas
    .filter((control) => control.webPartData)
    .map((control) => control.webPartData.title);

test("CanvasHelper builds a canvas for a page that has none", () => {
  const canvas = CanvasHelper.compose(null, [markdown("Doctor")]);

  // A section, the web part, and the page settings slice last
  assert.equal(canvas.length, 2);
  assert.equal(canvas[0].webPartData.title, "Doctor");
  assert.equal(canvas[0].position.controlIndex, 1);
  assert.equal(canvas[0].webPartId, MARKDOWN_WEBPART);
  assert.equal(canvas[canvas.length - 1].controlType, 0);
  // The generated instance id is carried into the web part data
  assert.equal(canvas[0].id, canvas[0].webPartData.instanceId);
});

test("CanvasHelper places several segments in source order", () => {
  const canvas = CanvasHelper.compose(null, [
    markdown("Doctor"),
    { webPartId: ROLLUP_WEBPART, webPartData: { title: "Related" } },
    markdown("Doctor (2)"),
  ]);

  assert.deepEqual(titles(canvas), ["Doctor", "Related", "Doctor (2)"]);
  assert.deepEqual(
    canvas.filter((c) => c.position).map((c) => c.position.controlIndex),
    [1, 2, 3],
  );
  assert.equal(canvas[1].webPartId, ROLLUP_WEBPART);
});

test("CanvasHelper reuses the instance id of the control it replaces", () => {
  const existing = [webPart("instance-1", "Doctor", 1), SETTINGS];

  const canvas = CanvasHelper.compose(
    existing,
    [{ ...markdown("Doctor"), instanceId: "instance-1" }],
    { ownedInstanceIds: ["instance-1"] },
  );

  assert.equal(canvas.length, 2);
  assert.equal(canvas[0].id, "instance-1");
  assert.equal(canvas[0].webPartData.instanceId, "instance-1");
});

test("CanvasHelper leaves controls it does not own alone", () => {
  const existing = [
    webPart("theirs-1", "Hand made hero", 1),
    webPart("ours-1", "Doctor", 2),
    webPart("theirs-2", "Their footer", 3),
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(existing, [markdown("Doctor")], {
    ownedInstanceIds: ["ours-1"],
  });

  assert.deepEqual(titles(canvas), [
    "Hand made hero",
    "Doctor",
    "Their footer",
  ]);
  // The foreign controls keep their own instance ids
  assert.equal(canvas[0].id, "theirs-1");
  assert.equal(canvas[2].id, "theirs-2");
  assert.deepEqual(
    canvas.filter((c) => c.position).map((c) => c.position.controlIndex),
    [1, 2, 3],
  );
});

test("CanvasHelper removes the controls whose segment disappeared", () => {
  const existing = [
    webPart("ours-1", "Doctor", 1),
    webPart("ours-2", "Related", 2, ROLLUP_WEBPART),
    webPart("ours-3", "Doctor (2)", 3),
    webPart("theirs-1", "Their footer", 4),
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(
    existing,
    [{ ...markdown("Doctor"), instanceId: "ours-1" }],
    { ownedInstanceIds: ["ours-1", "ours-2", "ours-3"] },
  );

  assert.deepEqual(titles(canvas), ["Doctor", "Their footer"]);
});

test("CanvasHelper reorders doctor's controls without moving the others", () => {
  const existing = [
    webPart("theirs-1", "Hand made hero", 1),
    webPart("ours-1", "Doctor", 2),
    webPart("ours-2", "Related", 3, ROLLUP_WEBPART),
    SETTINGS,
  ];

  // The control shortcode moved above the markdown in the source
  const canvas = CanvasHelper.compose(
    existing,
    [
      {
        webPartId: ROLLUP_WEBPART,
        webPartData: { title: "Related" },
        instanceId: "ours-2",
      },
      { ...markdown("Doctor"), instanceId: "ours-1" },
    ],
    { ownedInstanceIds: ["ours-1", "ours-2"] },
  );

  assert.deepEqual(titles(canvas), ["Hand made hero", "Related", "Doctor"]);
  assert.equal(canvas[1].id, "ours-2");
  assert.equal(canvas[2].id, "ours-1");
});

test("CanvasHelper recognises its own control by title when there is no state", () => {
  const existing = [webPart("unknown-1", "Doctor", 1), SETTINGS];

  const canvas = CanvasHelper.compose(existing, [markdown("Doctor")], {
    ownedTitlePrefix: "Doctor",
  });

  assert.equal(titles(canvas).length, 1);
  assert.equal(canvas.length, 2);
});

test("CanvasHelper recognises the numbered controls of a split page", () => {
  const existing = [
    webPart("unknown-1", "Doctor", 1),
    webPart("unknown-2", "Related", 2, ROLLUP_WEBPART),
    webPart("unknown-3", "Doctor (2)", 3),
    webPart("theirs-1", "Something else", 4),
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(existing, [markdown("Doctor")], {
    ownedTitlePrefix: "Doctor",
  });

  // Both markdown controls are doctor's; the rollup and the foreign one are not
  // recognisable without state, so they stay put
  assert.deepEqual(titles(canvas), ["Doctor", "Related", "Something else"]);
});

test("CanvasHelper does not claim a same-titled control in another column", () => {
  const existing = [
    { position: position(1), emphasis: {}, displayMode: 2 },
    {
      ...webPart("theirs-1", "Doctor", 1),
      position: position(1, { zoneIndex: 2, sectionIndex: 2 }),
    },
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(existing, [markdown("Doctor")], {
    ownedTitlePrefix: "Doctor",
  });

  // The look-alike in the other column survives, doctor's own is added
  assert.equal(titles(canvas).length, 2);
  assert.ok(canvas.some((control) => control.id === "theirs-1"));
});

test("CanvasHelper replaces an empty column placeholder", () => {
  const existing = [
    { position: position(1), emphasis: {}, displayMode: 2 },
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(existing, [markdown("Doctor")]);

  assert.equal(canvas.length, 2);
  assert.equal(canvas[0].webPartData.title, "Doctor");
  assert.equal(canvas[canvas.length - 1].controlType, 0);
});

test("CanvasHelper keeps the page settings slice last", () => {
  const existing = [SETTINGS, webPart("ours-1", "Doctor", 1)];

  const canvas = CanvasHelper.compose(existing, [markdown("Doctor")], {
    ownedInstanceIds: ["ours-1"],
  });

  assert.equal(canvas[canvas.length - 1].controlType, 0);
});

test("CanvasHelper refuses a section or column the page does not have", () => {
  const existing = [webPart("ours-1", "Doctor", 1), SETTINGS];

  assert.throws(
    () => CanvasHelper.compose(existing, [markdown("Doctor")], { section: 3 }),
    /Section 3 does not exist/,
  );
  assert.throws(
    () => CanvasHelper.compose(existing, [markdown("Doctor")], { column: 4 }),
    /Column 4 does not exist/,
  );
});

test("CanvasHelper does not touch the input canvas", () => {
  const existing = [webPart("ours-1", "Doctor", 1), SETTINGS];
  const before = JSON.stringify(existing);

  CanvasHelper.compose(existing, [markdown("Doctor")], {
    ownedInstanceIds: ["ours-1"],
  });

  assert.equal(JSON.stringify(existing), before);
});

test("CanvasHelper honours every instance id it is given", () => {
  // The caller generates the ids so it can record exactly what was written to
  // the page; compose must not substitute its own.
  const canvas = CanvasHelper.compose(null, [
    { ...markdown("Doctor"), instanceId: "given-1" },
    {
      webPartId: ROLLUP_WEBPART,
      webPartData: { title: "Related" },
      instanceId: "given-2",
    },
  ]);

  assert.deepEqual(
    canvas.filter((c) => c.webPartData).map((c) => c.id),
    ["given-1", "given-2"],
  );
  assert.deepEqual(
    canvas.filter((c) => c.webPartData).map((c) => c.webPartData.instanceId),
    ["given-1", "given-2"],
  );
});
