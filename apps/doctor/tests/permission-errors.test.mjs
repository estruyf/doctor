import test from "node:test";
import assert from "node:assert/strict";

import { isPermissionError } from "../dist/utils/isPermissionError.js";

test("a CSOM access denied is a permission error", () => {
  // The wording that killed a publish at the navigation step. The shorter
  // "access denied" check this replaced does not match "Access is denied".
  assert.equal(
    isPermissionError(
      "Command failed: spo navigation node remove. Access is denied. (Exception from HRESULT: 0x80070005 (E_ACCESSDENIED))",
    ),
    true,
  );
});

test("an unauthorized system update is a permission error", () => {
  assert.equal(
    isPermissionError(
      new Error(
        'ErrorMessage":"Attempted to perform an unauthorized operation.","ErrorTypeName":"System.UnauthorizedAccessException',
      ),
    ),
    true,
  );
});

test("REST status codes are permission errors", () => {
  for (const message of [
    "GET https://x failed with status 401 (Unauthorized).",
    "POST https://x failed with status 403 (Forbidden).",
    "Request failed with status code 403",
    "Insufficient privileges to complete the operation.",
  ]) {
    assert.equal(isPermissionError(message), true, message);
  }
});

test("an ordinary failure is not a permission error", () => {
  for (const message of [
    "POST https://x failed with status 409 (Conflict). Save Conflict",
    "GET https://x failed with status 404 (Not Found).",
    "getaddrinfo ENOTFOUND contoso.sharepoint.com",
    "Term with name 'Finance' could not be found.",
  ]) {
    assert.equal(isPermissionError(message), false, message);
  }
});

test("a missing or odd error is not mistaken for one", () => {
  assert.equal(isPermissionError(undefined), false);
  assert.equal(isPermissionError(null), false);
  assert.equal(isPermissionError({}), false);
  assert.equal(isPermissionError(""), false);
});

test("a timeout or a throttle is not a refusal", () => {
  // setPageDescription turns a refusal into a run-long fallback that changes
  // 'Modified' on every page. A transient failure must not trigger that.
  for (const message of [
    "Command failed: spo listitem set. socket hang up",
    "Command failed: spo listitem set. Request timed out after 120000ms",
    "Command failed: spo listitem set. 429 Too Many Requests",
    "Command failed: spo listitem set. read ECONNRESET",
    "Command failed: spo listitem set. status 503",
  ]) {
    assert.equal(isPermissionError(message), false, message);
  }
});
