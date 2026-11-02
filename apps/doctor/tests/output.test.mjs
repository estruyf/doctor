import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import { OutputHelper } from "../dist/helpers/OutputHelper.js";
import { StatusHelper } from "../dist/helpers/StatusHelper.js";

/**
 * Runs the callback with stdout and console captured, so the test can assert on
 * what a pipeline would receive.
 */
const capture = (callback) => {
  const stdout = [];
  const logged = [];
  const originalWrite = process.stdout.write;
  const originalLog = console.log;
  const originalInfo = console.info;

  process.stdout.write = (chunk) => {
    stdout.push(`${chunk}`);
    return true;
  };
  console.log = (...args) => logged.push(args.join(" "));
  console.info = (...args) => logged.push(args.join(" "));

  try {
    callback();
  } finally {
    process.stdout.write = originalWrite;
    console.log = originalLog;
    console.info = originalInfo;
  }

  return { stdout: stdout.join(""), logged };
};

afterEach(() => {
  OutputHelper.reset();
  StatusHelper.reset();
});

test("The output format defaults to the human readable one", () => {
  assert.equal(OutputHelper.parseFormat(undefined), "default");
  assert.equal(OutputHelper.parseFormat(null), "default");
  assert.equal(OutputHelper.parseFormat(""), "default");

  OutputHelper.init({});
  assert.equal(OutputHelper.isJson(), false);
});

test("The json format is accepted, casing and spacing included", () => {
  assert.equal(OutputHelper.parseFormat("json"), "json");
  assert.equal(OutputHelper.parseFormat(" JSON "), "json");

  OutputHelper.init({ output: "json" });
  assert.equal(OutputHelper.isJson(), true);
});

test("An unknown format fails instead of falling back to the default", () => {
  // A typo would otherwise hand a pipeline human output to parse
  assert.throws(() => OutputHelper.parseFormat("jsonn"), /must be one of/);
});

test("The human output is silenced when json is requested", () => {
  OutputHelper.init({ output: "json" });

  const { logged } = capture(() => {
    OutputHelper.log("a line");
    OutputHelper.info("another line");
  });

  assert.deepEqual(logged, []);
});

test("The human output is written when json is not requested", () => {
  OutputHelper.init({});

  const { logged } = capture(() => {
    OutputHelper.log("a line");
    OutputHelper.info("another line");
  });

  assert.deepEqual(logged, ["a line", "another line"]);
});

test("A warning is kept for the result instead of being printed", () => {
  OutputHelper.init({ output: "json" });

  const { logged } = capture(() => OutputHelper.warning("Deleted pages are not removed"));

  assert.deepEqual(logged, []);
  assert.deepEqual(StatusHelper.getWarnings(), ["Deleted pages are not removed"]);
});

test("The result is a single document with the command details filled in", () => {
  OutputHelper.init({ output: "json" });

  const { stdout } = capture(() => {
    OutputHelper.setResult({ summary: { changed: 2 } });
    OutputHelper.flush({ command: "status", version: "2.1.0" });
  });

  const result = JSON.parse(stdout);
  assert.equal(result.command, "status");
  assert.equal(result.success, true);
  assert.equal(result.version, "2.1.0");
  assert.equal(result.summary.changed, 2);
});

test("The command keeps control over the reported success", () => {
  OutputHelper.init({ output: "json" });

  const { stdout } = capture(() => {
    OutputHelper.setResult({ command: "publish", success: false });
    OutputHelper.flush({ command: "publish", version: "2.1.0" });
  });

  assert.equal(JSON.parse(stdout).success, false);
});

test("A command without a result still returns a parsable document", () => {
  OutputHelper.init({ output: "json" });

  const { stdout } = capture(() =>
    OutputHelper.flush({ command: "init", version: "2.1.0" })
  );

  assert.deepEqual(JSON.parse(stdout), {
    command: "init",
    success: true,
    version: "2.1.0",
  });
});

test("The result of a command is written once", () => {
  OutputHelper.init({ output: "json" });

  const { stdout } = capture(() => {
    OutputHelper.setResult({ summary: { changed: 2 } });
    OutputHelper.flush({ command: "status", version: "2.1.0" });
    OutputHelper.flush({ command: "status", version: "2.1.0" });
  });

  assert.equal(
    stdout.match(/"summary"/g).length,
    1,
    "a repeated result would break the parser on the other end"
  );
});

test("Nothing is written when the run reports to a human", () => {
  OutputHelper.init({});

  const { stdout } = capture(() => {
    OutputHelper.setResult({ summary: { changed: 2 } });
    OutputHelper.flush({ command: "status", version: "2.1.0" });
    OutputHelper.flushError({ command: "status", version: "2.1.0" }, "Boom");
  });

  assert.equal(stdout, "");
});

test("A failed run reports the error and the warnings it collected", () => {
  OutputHelper.init({ output: "json" });

  const { stdout } = capture(() => {
    OutputHelper.warning("Deleted pages are not removed");
    OutputHelper.flushError(
      { command: "publish", version: "2.1.0" },
      "The provided folder location doesn't exist."
    );
  });

  const result = JSON.parse(stdout);
  assert.equal(result.command, "publish");
  assert.equal(result.success, false);
  assert.equal(result.error.message, "The provided folder location doesn't exist.");
  assert.deepEqual(result.warnings, ["Deleted pages are not removed"]);
});
