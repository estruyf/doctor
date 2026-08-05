import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DoctorTranspiler } from "../dist/helpers/DoctorTranspiler.js";
import { StateHelper } from "../dist/helpers/StateHelper.js";

const WEB_URL = "https://contoso.sharepoint.com/sites/docs";

const page = (title, slug, id, parent) => `---
title: ${title}
slug: ${slug}

menu:
  QuickLaunch:
    id: ${id}
    parent: ${parent}
---

# ${title}
`;

/**
 * Creates a content folder with a changed and an unchanged page, and primes the
 * publish state so only the changed page ends up in the processing plan.
 */
const createContentFolder = async () => {
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-nav-"));
  const testsFolder = join(startFolder, "tests");
  await mkdir(testsFolder);

  const unchangedFile = join(testsFolder, "codeblocks.md");
  const changedFile = join(testsFolder, "extended-markdown.md");

  const unchangedContents = page(
    "Codeblocks",
    "tests/codeblocks.aspx",
    "codeblocks",
    "tests"
  );
  await writeFile(unchangedFile, unchangedContents, { encoding: "utf-8" });
  await writeFile(
    changedFile,
    page(
      "Extended markdown",
      "tests/extended-markdown.aspx",
      "extended-markdown",
      "tests"
    ),
    { encoding: "utf-8" }
  );

  // Pretend a previous publish already handled the codeblocks page
  StateHelper.reset();
  StateHelper.state = {
    version: 1,
    pages: {
      "tests/codeblocks.aspx": {
        sourceHash: StateHelper.hashContent(unchangedContents),
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
  StateHelper.loaded = true;

  return { startFolder, changedFile, unchangedFile };
};

test("Unchanged pages still contribute their menu item to the navigation", async (t) => {
  const { startFolder, changedFile } = await createContentFolder();
  t.after(() => StateHelper.reset());

  const output = { navigation: { QuickLaunch: { items: [] } } };
  const options = { webUrl: WEB_URL, startFolder };

  const plan = await DoctorTranspiler.buildProcessingPlan(
    [join(startFolder, "tests", "codeblocks.md"), changedFile],
    options,
    output
  );

  assert.deepEqual(plan.filesToProcess, [changedFile]);
  assert.equal(plan.skippedUnchanged, 1);

  const [root] = output.navigation.QuickLaunch.items;
  assert.equal(root.id, "tests");
  assert.deepEqual(
    root.items.map((i) => i.name),
    ["Codeblocks"]
  );
  assert.equal(root.items[0].url, `${WEB_URL}/sitepages/tests/codeblocks.aspx`);
});

test("Draft pages are kept out of the navigation when they are skipped as unchanged", async (t) => {
  const startFolder = await mkdtemp(join(tmpdir(), "doctor-nav-draft-"));
  const draftFile = join(startFolder, "draft.md");
  const contents = `---
title: Draft page
slug: draft.aspx
draft: true

menu:
  QuickLaunch:
    id: draft
    parent: tests
---

# Draft
`;
  await writeFile(draftFile, contents, { encoding: "utf-8" });

  StateHelper.reset();
  StateHelper.state = {
    version: 1,
    pages: {
      "draft.aspx": {
        sourceHash: StateHelper.hashContent(contents),
        publishedAt: "2026-01-01T00:00:00.000Z",
      },
    },
  };
  StateHelper.loaded = true;
  t.after(() => StateHelper.reset());

  const output = { navigation: { QuickLaunch: { items: [] } } };
  const plan = await DoctorTranspiler.buildProcessingPlan(
    [draftFile],
    { webUrl: WEB_URL, startFolder },
    output
  );

  assert.equal(plan.skippedUnchanged, 1);
  assert.deepEqual(output.navigation.QuickLaunch.items, []);
});
