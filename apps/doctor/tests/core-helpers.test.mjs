import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { load } from "cheerio";

import { FrontMatterHelper } from "../dist/helpers/FrontMatterHelper.js";
import { NavigationHelper } from "../dist/helpers/NavigationHelper.js";
import { OptionsHelper } from "../dist/helpers/OptionsHelper.js";
import {
  CliCommand,
  DEFAULT_COMMAND_TIMEOUT,
} from "../dist/helpers/CliCommand.js";
import { relativePath } from "../dist/utils/relativePath.js";

test("FrontMatterHelper.getSlug generates slug from title and folder path", () => {
  const slug = FrontMatterHelper.getSlug(
    { title: "Getting Started" },
    "./docs",
    "./docs/guides/intro.md"
  );

  assert.equal(slug, "guides/getting-started.aspx");
});

test("FrontMatterHelper.getSlug appends .aspx to explicit slug", () => {
  const slug = FrontMatterHelper.getSlug(
    { title: "Ignored", slug: "custom/page" },
    "./docs",
    "./docs/intro.md"
  );

  assert.equal(slug, "custom/page.aspx");
});

test("NavigationHelper.hierarchy creates nested parents and page link", () => {
  const result = NavigationHelper.hierarchy(
    "https://contoso.sharepoint.com/sites/docs",
    {},
    {
      QuickLaunch: {
        id: "gettingstarted",
        name: "Getting Started",
        parent: "Docs/Guides",
        weight: 1,
      },
    },
    "getting-started.aspx",
    "Getting Started"
  );

  const root = result.QuickLaunch.items[0];
  assert.equal(root.id, "docs");
  assert.equal(root.items?.[0]?.id, "guides");
  assert.equal(root.items?.[0]?.items?.[0]?.id, "gettingstarted");
  assert.equal(
    root.items?.[0]?.items?.[0]?.url,
    "https://contoso.sharepoint.com/sites/docs/sitepages/getting-started.aspx"
  );
});

test("OptionsHelper.parseArguments maps raw CLI arguments", () => {
  const parsed = OptionsHelper.parseArguments({}, [
    "node",
    "doctor",
    "publish",
    "--url",
    "https://contoso.sharepoint.com/sites/docs",
    "--folder",
    "./docs",
    "--forceAll",
    "--applyTheme",
  ]);

  assert.equal(parsed.task, "publish");
  assert.equal(parsed.webUrl, "https://contoso.sharepoint.com/sites/docs");
  assert.equal(parsed.startFolder, "./docs");
  assert.equal(parsed.forceAll, true);
  assert.equal(parsed.applyTheme, true);
  assert.equal(parsed.auth, "certificate");
});

test("OptionsHelper.parseArguments always resolves to certificate authentication", () => {
  const parsed = OptionsHelper.parseArguments({ auth: "deviceCode" }, [
    "node",
    "doctor",
    "publish",
    "--auth",
    "password",
  ]);

  assert.equal(parsed.auth, "certificate");
});

test("OptionsHelper.parseArguments takes the options from the doctor.json config", () => {
  const config = {
    url: "https://contoso.sharepoint.com/sites/docs",
    folder: "./docs",
    library: "Documents",
    stateFile: "publish/state.json",
    disableStatePersistence: true,
    forceAll: true,
    skipPrecheck: true,
    applyTheme: true,
    verbose: true,
    timingDetails: true,
  };

  const parsed = OptionsHelper.parseArguments(config, ["node", "doctor", "publish"]);

  assert.equal(parsed.webUrl, config.url);
  assert.equal(parsed.assetLibrary, "Documents");
  assert.equal(parsed.stateFile, "publish/state.json");
  assert.equal(parsed.disableStatePersistence, true);
  assert.equal(parsed.forceAll, true);
  assert.equal(parsed.skipPrecheck, true);
  assert.equal(parsed.applyTheme, true);
  assert.equal(parsed.verbose, true);
  assert.equal(parsed.timingDetails, true);
});

test("OptionsHelper.parseArguments falls back to the default state file", () => {
  const parsed = OptionsHelper.parseArguments({}, ["node", "doctor", "publish"]);

  assert.equal(parsed.stateFile, ".doctor/state.json");
  assert.equal(parsed.disableStatePersistence, false);
  assert.equal(parsed.applyTheme, false);
});

test("OptionsHelper.parseArguments takes the commandTimeout from the arguments and config", () => {
  const fromArgs = OptionsHelper.parseArguments({ commandTimeout: 60000 }, [
    "node",
    "doctor",
    "publish",
    "--commandTimeout",
    "300000",
  ]);
  assert.equal(fromArgs.commandTimeout, 300000);

  const fromConfig = OptionsHelper.parseArguments({ commandTimeout: 60000 }, [
    "node",
    "doctor",
    "publish",
  ]);
  assert.equal(fromConfig.commandTimeout, 60000);

  const notProvided = OptionsHelper.parseArguments({}, ["node", "doctor", "publish"]);
  assert.equal(notProvided.commandTimeout, null);
});

test("CliCommand.getTimeout uses the configured command timeout", (t) => {
  t.after(() => CliCommand.reset());

  CliCommand.init({ commandTimeout: 300000 });
  assert.equal(CliCommand.getTimeout(), 300000);

  // The value can come from doctor.json, so it can be a string as well
  CliCommand.init({ commandTimeout: "45000" });
  assert.equal(CliCommand.getTimeout(), 45000);
});

test("CliCommand.getTimeout falls back to the default for missing or invalid values", (t) => {
  t.after(() => CliCommand.reset());

  for (const value of [undefined, null, "", 0, -1000, "abc", 12.5, Infinity]) {
    CliCommand.init({ commandTimeout: value });
    assert.equal(
      CliCommand.getTimeout(),
      DEFAULT_COMMAND_TIMEOUT,
      `Expected the default timeout for value "${value}"`
    );
  }
});

test("CliCommand.reset restores the default command timeout", () => {
  CliCommand.init({ commandTimeout: 300000 });
  CliCommand.reset();

  assert.equal(CliCommand.getTimeout(), DEFAULT_COMMAND_TIMEOUT);
});

test("relativePath makes paths relative to the working directory", () => {
  const filePath = join(process.cwd(), "src", "docs", "guides", "index.md");

  assert.equal(relativePath(filePath), "src/docs/guides/index.md");
});

test("relativePath keeps paths outside the working directory absolute", () => {
  const filePath = join(process.cwd(), "..", "elsewhere", "index.md");

  assert.equal(relativePath(filePath), filePath);
});

test("relativePath returns falsy values untouched", () => {
  assert.equal(relativePath(""), "");
});

//
// The certificate password from the environment
//

const withEnv = (t, value) => {
  const before = process.env.DOCTOR_CERTIFICATE_PASSWORD;
  if (value === undefined) {
    delete process.env.DOCTOR_CERTIFICATE_PASSWORD;
  } else {
    process.env.DOCTOR_CERTIFICATE_PASSWORD = value;
  }
  t.after(() => {
    if (before === undefined) {
      delete process.env.DOCTOR_CERTIFICATE_PASSWORD;
    } else {
      process.env.DOCTOR_CERTIFICATE_PASSWORD = before;
    }
  });
};

test("OptionsHelper.parseArguments reads the certificate password from the environment", (t) => {
  // The channel that does not leak: --password is echoed by the terminal and
  // visible in the process list
  withEnv(t, "from-env");
  const parsed = OptionsHelper.parseArguments({}, ["node", "doctor", "publish"]);
  assert.equal(parsed.password, "from-env");
});

test("OptionsHelper.parseArguments prefers doctor.json's password to the environment", (t) => {
  withEnv(t, "from-env");
  const parsed = OptionsHelper.parseArguments({ password: "from-file" }, ["node", "doctor", "publish"]);
  assert.equal(parsed.password, "from-file");
});

test("OptionsHelper.parseArguments prefers --password to both", (t) => {
  withEnv(t, "from-env");
  const parsed = OptionsHelper.parseArguments({ password: "from-file" }, [
    "node", "doctor", "publish", "--password", "from-argument",
  ]);
  assert.equal(parsed.password, "from-argument");
});

test("OptionsHelper.parseArguments leaves the password empty when nothing supplies one", (t) => {
  withEnv(t, undefined);
  const parsed = OptionsHelper.parseArguments({}, ["node", "doctor", "publish"]);
  assert.equal(parsed.password, null);
});

test("OptionsHelper.parseArguments ignores an empty environment variable", (t) => {
  // An exported-but-empty variable is how a shell says "not set" often enough
  withEnv(t, "");
  const parsed = OptionsHelper.parseArguments({}, ["node", "doctor", "publish"]);
  assert.equal(parsed.password, null);
});

test("MermaidHelper reads a diagram's type past its front matter and comments", async () => {
  const { MermaidHelper } = await import("../dist/helpers/MermaidHelper.js");

  assert.equal(MermaidHelper.getDiagramType("mindmap\n  root((doctor))"), "mindmap");
  assert.equal(MermaidHelper.getDiagramType("%% a comment\nflowchart TD\n A-->B"), "flowchart");
  assert.equal(
    MermaidHelper.getDiagramType("---\ntitle: Pages\n---\nC4Context\n  title x"),
    "C4Context",
  );
  assert.equal(MermaidHelper.getDiagramType("graph LR;A-->B"), "graph");
});

test("MermaidHelper leaves a diagram that needs a browser to SharePoint, and says why", async (t) => {
  const { MermaidHelper } = await import("../dist/helpers/MermaidHelper.js");
  const { OutputHelper } = await import("../dist/helpers/OutputHelper.js");

  const realWarning = OutputHelper.warning;
  t.after(() => {
    OutputHelper.warning = realWarning;
  });
  const warnings = [];
  OutputHelper.warning = (message) => warnings.push(message);

  assert.equal(
    await MermaidHelper.render('C4Context\n  Person(user, "Author")'),
    null,
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"C4Context" diagram, which needs a browser/);
});

test("MermaidHelper draws a mindmap, with every label centred on its node", async (t) => {
  // svgdom gives an HTML element no client size and no computed padding, so
  // Cytoscape sized its container as NaN and the layout failed on "reading 'h'"
  const { MermaidHelper } = await import("../dist/helpers/MermaidHelper.js");
  const { OutputHelper } = await import("../dist/helpers/OutputHelper.js");

  const realWarning = OutputHelper.warning;
  t.after(() => {
    OutputHelper.warning = realWarning;
  });
  const warnings = [];
  OutputHelper.warning = (message) => warnings.push(message);

  const diagram = await MermaidHelper.render(
    "mindmap\n  root((doctor))\n    a[Pages]\n    b{{Navigation}}\n    c)Metadata(",
  );

  assert.deepEqual(warnings, []);
  assert.ok(diagram, "the mindmap is drawn");

  const $ = load(diagram.svg, { xml: true });
  const labels = $(".mindmap-node > g.label");
  assert.equal(labels.length, 4);
  labels.each((_index, element) => {
    const $label = $(element);
    const atCentre = /^translate\(\s*0\s*,/.test($label.attr("transform"));
    // A label left at x=0 is centred by its anchor; one shifted left by half
    // its width already is, and must not be centred a second time
    assert.equal(
      $label.find("text").attr("text-anchor"),
      atCentre ? "middle" : undefined,
      $label.text(),
    );
  });
});

test("MermaidHelper uploads a diagram under a name that changes with the drawing", async (t) => {
  // An existing file is kept unless --overwriteImages is set, so a name taken
  // from the definition alone left a diagram on whatever was drawn first — a
  // broken SVG stayed broken after the fix that repaired it
  const { MermaidHelper } = await import("../dist/helpers/MermaidHelper.js");
  const { CliCommand } = await import("../dist/helpers/CliCommand.js");
  const { FileHelpers } = await import("../dist/helpers/FileHelpers.js");
  const { FolderHelpers } = await import("../dist/helpers/FolderHelpers.js");

  const realOptions = CliCommand.options;
  const realCreate = FileHelpers.create;
  const realFolder = FolderHelpers.create;
  t.after(() => {
    CliCommand.options = realOptions;
    FileHelpers.create = realCreate;
    FolderHelpers.create = realFolder;
  });

  const uploads = [];
  CliCommand.options = {
    webUrl: "https://contoso.sharepoint.com/sites/docs",
    assetLibrary: "Shared Documents",
  };
  FolderHelpers.create = async () => "/sites/docs/Shared Documents/mermaid";
  FileHelpers.create = async (folder, path, _webUrl, overwrite) => {
    uploads.push({ path, overwrite });
    return `${folder}/${path.split(/[\\/]/).pop()}`;
  };

  const first = await MermaidHelper.render("flowchart TD\n  A --> B");
  const again = await MermaidHelper.render("flowchart TD\n  A --> B");

  assert.equal(uploads.length, 2);
  assert.match(first.src, /\/mermaid\/doctor-mermaid-[a-f0-9]{10}-[a-f0-9]{8}\.svg$/);
  // The same drawing keeps its file
  assert.equal(again.src, first.src);
  assert.equal(uploads[0].overwrite, false);
});
