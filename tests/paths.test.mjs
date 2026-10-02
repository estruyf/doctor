import test from "node:test";
import assert from "node:assert/strict";

import { toComparablePath } from "../dist/utils/toComparablePath.js";
import { FrontMatterHelper } from "../dist/helpers/FrontMatterHelper.js";

const ROOT = "/Users/dmitriy/repos/project";

test("a path is brought to one form whichever way it was written", () => {
  assert.equal(toComparablePath("./src", ROOT), `${ROOT}/src`);
  assert.equal(toComparablePath("src", ROOT), `${ROOT}/src`);
  assert.equal(toComparablePath("./src/", ROOT), `${ROOT}/src`);
  assert.equal(toComparablePath(".//src", ROOT), `${ROOT}/src`);
  assert.equal(toComparablePath("src\\guides", ROOT), `${ROOT}/src/guides`);
  // Already rooted, so the root is not applied again
  assert.equal(toComparablePath("/elsewhere/src", ROOT), "/elsewhere/src");
  assert.equal(toComparablePath("C:\\repos\\src", ROOT), "C:/repos/src");
  // The folder itself, and nothing at all
  assert.equal(toComparablePath(".", ROOT), ROOT);
  assert.equal(toComparablePath("", ROOT), ROOT);
});

test("without a root a path is left relative, but still comparable", () => {
  assert.equal(toComparablePath("./src/guides"), "src/guides");
  assert.equal(toComparablePath("src/guides"), "src/guides");
});

//
// The slug a page gets must not depend on how its paths were written
//

test("the same page gets the same slug however the paths reach getSlug", () => {
  // `--folder` keeps what was configured, fast-glob preserves the `./` of the
  // pattern, and path.join strips it. A content folder written as `src` used to
  // put a `./` at the front of every page URL.
  const data = { title: "Other page" };
  const expected = "guides/other-page.aspx";

  for (const [startFolder, filePath] of [
    ["./src", "./src/guides/page.md"],
    [".//src", ".//src/guides/page.md"],
    ["src", "./src/guides/page.md"],
    ["./src", "src/guides/page.md"],
    ["src", "src/guides/page.md"],
    ["./src/", "./src/guides/page.md"],
    [`${ROOT}/src`, `${ROOT}/src/guides/page.md`],
  ]) {
    assert.equal(
      FrontMatterHelper.getSlug(data, startFolder, filePath),
      expected,
      `${startFolder} + ${filePath}`,
    );
  }
});

test("a relative folder and an absolute file path still meet", () => {
  // getSlug roots both against the working directory, so the two do not have to
  // be written the same way to describe the same place
  const cwd = process.cwd().replace(/\\/g, "/");

  assert.equal(
    FrontMatterHelper.getSlug(
      { title: "Other page" },
      "./src",
      `${cwd}/src/guides/page.md`,
    ),
    "guides/other-page.aspx",
  );
  assert.equal(
    FrontMatterHelper.getSlug(
      { title: "Other page" },
      `${cwd}/src`,
      "src/guides/page.md",
    ),
    "guides/other-page.aspx",
  );
});

test("a page at the top of the content folder has no folders in its slug", () => {
  assert.equal(
    FrontMatterHelper.getSlug({ title: "Home" }, "./src", "./src/home.md"),
    "home.aspx",
  );
  assert.equal(
    FrontMatterHelper.getSlug({ title: "Home" }, "src", "src/home.md"),
    "home.aspx",
  );
});

test("an explicit slug is never derived from the path", () => {
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "custom/page" }, "./src", "src/x.md"),
    "custom/page.aspx",
  );
  assert.equal(
    FrontMatterHelper.getSlug({ title: "T", slug: "custom/page.aspx" }, "src", "./src/x.md"),
    "custom/page.aspx",
  );
});
