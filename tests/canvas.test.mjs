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

test("CanvasHelper clears everything else out of its content section", () => {
  // The markdown file is the page: whatever else ended up in doctor's section
  // goes, so the section is exactly what the file says
  const existing = [
    webPart("theirs-1", "Added by hand", 1),
    webPart("ours-1", "Doctor", 2),
    webPart("theirs-2", "Also added by hand", 3),
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(existing, [markdown("Doctor")], {
    ownedInstanceIds: ["ours-1"],
  });

  assert.deepEqual(titles(canvas), ["Doctor"]);
  assert.equal(canvas[canvas.length - 1].controlType, 0);
});

test("CanvasHelper leaves the other sections alone", () => {
  // Only doctor's own section is rewritten — a banner, a vertical section or
  // whatever a template brought along keeps working
  const vertical = {
    ...webPart("vert-1", "In the sidebar", 1, ROLLUP_WEBPART),
    position: {
      zoneIndex: 1,
      sectionIndex: 1,
      sectionFactor: 12,
      layoutIndex: 2,
      controlIndex: 1,
    },
  };
  const existing = [
    vertical,
    {
      ...webPart("theirs-1", "Banner", 1, ROLLUP_WEBPART),
      position: {
        zoneIndex: 1,
        sectionIndex: 1,
        sectionFactor: 0,
        layoutIndex: 1,
        controlIndex: 1,
      },
    },
    {
      ...webPart("ours-1", "Doctor", 1),
      position: {
        zoneIndex: 2,
        sectionIndex: 1,
        sectionFactor: 12,
        layoutIndex: 1,
        controlIndex: 1,
      },
    },
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(existing, [markdown("Doctor")], {
    ownedInstanceIds: ["ours-1"],
  });

  assert.ok(canvas.some((c) => c.id === "vert-1"), "vertical section kept");
  assert.ok(canvas.some((c) => c.id === "theirs-1"), "banner kept");
  assert.equal(titles(canvas).length, 3);
});

test("CanvasHelper removes the controls whose segment disappeared", () => {
  const existing = [
    webPart("ours-1", "Doctor", 1),
    webPart("ours-2", "Related", 2, ROLLUP_WEBPART),
    webPart("ours-3", "Doctor (2)", 3),
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(
    existing,
    [{ ...markdown("Doctor"), instanceId: "ours-1" }],
    { ownedInstanceIds: ["ours-1", "ours-2", "ours-3"] },
  );

  assert.deepEqual(titles(canvas), ["Doctor"]);
});

test("CanvasHelper reorders doctor's controls without moving the others", () => {
  const existing = [
    {
      ...webPart("theirs-1", "Hand made hero", 1, ROLLUP_WEBPART),
      position: {
        zoneIndex: 1,
        sectionIndex: 1,
        sectionFactor: 0,
        layoutIndex: 1,
        controlIndex: 1,
      },
    },
    { ...webPart("ours-1", "Doctor", 1), position: position(1, { zoneIndex: 2 }) },
    {
      ...webPart("ours-2", "Related", 2, ROLLUP_WEBPART),
      position: position(2, { zoneIndex: 2 }),
    },
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
    SETTINGS,
  ];

  // `Doctor` and `Doctor (2)` are recognised by title; the rollup between them
  // is not, but it sits in doctor's section and the file no longer asks for it
  const canvas = CanvasHelper.compose(existing, [markdown("Doctor")], {
    ownedTitlePrefix: "Doctor",
  });

  assert.deepEqual(titles(canvas), ["Doctor"]);
});

test("CanvasHelper claims its own control in whatever section it sits", () => {
  // The title fallback is deliberately not scoped to one column: a page whose
  // layout changed still has exactly one doctor control afterwards, instead of
  // the old one being orphaned and a second one added next to it
  const existing = [
    { position: position(1), emphasis: {}, displayMode: 2 },
    {
      ...webPart("ours-1", "Doctor", 1),
      position: position(1, { zoneIndex: 2, sectionIndex: 2 }),
    },
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(existing, [markdown("Doctor")], {
    ownedTitlePrefix: "Doctor",
  });

  assert.equal(titles(canvas).length, 1);
  assert.equal(canvas.filter((c) => c.webPartData).length, 1);
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

//
// Sections: a banner lives in a full-width section, the content must not
//

const BANNER_WEBPART = "cbe7b0a9-3504-44dd-a3a3-0e5cacd07788";

const fullWidthSection = (controlIndex) => ({
  zoneIndex: 1,
  sectionIndex: 1,
  sectionFactor: 0,
  layoutIndex: 1,
  controlIndex,
});

const contentSection = (controlIndex, zoneIndex = 2) => ({
  zoneIndex,
  sectionIndex: 1,
  sectionFactor: 12,
  layoutIndex: 1,
  controlIndex,
});

const banner = () => ({
  controlType: 3,
  displayMode: 2,
  id: "banner-1",
  position: fullWidthSection(1),
  webPartId: BANNER_WEBPART,
  emphasis: {},
  webPartData: { id: BANNER_WEBPART, instanceId: "banner-1", title: "Banner" },
});

test("CanvasHelper never puts content in the full-width banner section", () => {
  // The exact page that went wrong: a banner alone in a full-width section,
  // and doctor's markdown web part in the ordinary section below it
  const existing = [
    banner(),
    { ...webPart("ours-1", "doctor-placeholder", 1), position: contentSection(1) },
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(existing, [markdown("doctor-placeholder")], {
    ownedTitlePrefix: "doctor-placeholder",
  });

  // One banner, one markdown web part — no duplicate left behind
  assert.deepEqual(titles(canvas), ["Banner", "doctor-placeholder"]);

  const content = canvas.find((c) => c.webPartId === MARKDOWN_WEBPART);
  assert.equal(content.position.zoneIndex, 2, "content stays out of the banner zone");
  assert.equal(content.position.sectionFactor, 12);
  // The banner keeps its own full-width section untouched
  const kept = canvas.find((c) => c.webPartId === BANNER_WEBPART);
  assert.equal(kept.id, "banner-1");
  assert.equal(kept.position.sectionFactor, 0);
});

test("CanvasHelper recognises its control in another section", () => {
  // Without state to go on, the title is the only signal — and it has to work
  // wherever the page happens to hold the control
  const existing = [
    banner(),
    { ...webPart("ours-1", "doctor-placeholder", 1), position: contentSection(1) },
    SETTINGS,
  ];

  const owned = CanvasHelper.getOwned(existing, {
    ownedTitlePrefix: "doctor-placeholder",
  });

  assert.deepEqual(owned.map((c) => c.id), ["ours-1"]);
});

test("CanvasHelper adds a section when the page only has a banner", () => {
  const canvas = CanvasHelper.compose([banner(), SETTINGS], [
    markdown("doctor-placeholder"),
  ]);

  const content = canvas.find((c) => c.webPartId === MARKDOWN_WEBPART);
  assert.equal(content.position.zoneIndex, 2, "a section of its own, below the banner");
  assert.equal(content.position.sectionFactor, 12);
  assert.equal(content.position.layoutIndex, 1);
  // The banner is still alone in its full-width section
  assert.equal(
    canvas.filter((c) => c.position && c.position.zoneIndex === 1).length,
    1,
  );
});

test("CanvasHelper keeps a page's content where it already is", () => {
  // Doctor's control sits in the third section; re-publishing must not move it
  const existing = [
    banner(),
    { ...webPart("theirs-1", "Their web part", 1), position: contentSection(1, 2) },
    { ...webPart("ours-1", "doctor-placeholder", 1), position: contentSection(1, 3) },
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(
    existing,
    [{ ...markdown("doctor-placeholder"), instanceId: "ours-1" }],
    { ownedInstanceIds: ["ours-1"] },
  );

  const content = canvas.find((c) => c.id === "ours-1");
  assert.equal(content.position.zoneIndex, 3);
  assert.deepEqual(titles(canvas), ["Banner", "Their web part", "doctor-placeholder"]);
});

test("CanvasHelper ignores the vertical section when picking a place", () => {
  const vertical = {
    ...webPart("vert-1", "In the sidebar", 1, ROLLUP_WEBPART),
    position: { zoneIndex: 1, sectionIndex: 1, sectionFactor: 12, layoutIndex: 2, controlIndex: 1 },
  };
  const canvas = CanvasHelper.compose(
    [vertical, banner(), SETTINGS],
    [markdown("doctor-placeholder")],
  );

  const content = canvas.find((c) => c.webPartId === MARKDOWN_WEBPART);
  assert.notEqual(content.position.layoutIndex, 2, "not in the vertical section");
  assert.notEqual(content.position.sectionFactor, 0, "not in the full-width section");
});

test("CanvasHelper puts several segments together in the content section", () => {
  const existing = [
    banner(),
    { ...webPart("ours-1", "doctor-placeholder", 1), position: contentSection(1) },
    SETTINGS,
  ];

  const canvas = CanvasHelper.compose(
    existing,
    [
      markdown("doctor-placeholder"),
      { webPartId: ROLLUP_WEBPART, webPartData: { title: "Related" } },
      markdown("doctor-placeholder (2)"),
    ],
    { ownedTitlePrefix: "doctor-placeholder" },
  );

  const placed = canvas.filter((c) => c.position && c.position.zoneIndex === 2);
  assert.equal(placed.length, 3);
  assert.deepEqual(placed.map((c) => c.position.controlIndex), [1, 2, 3]);
  assert.deepEqual(titles(canvas), [
    "Banner",
    "doctor-placeholder",
    "Related",
    "doctor-placeholder (2)",
  ]);
});
