import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkCertificatePassword } from "../dist/utils/checkCertificatePassword.js";
import { Authenticate } from "../dist/commands/authenticate.js";

/**
 * A certificate protected with a password used to reach the sign-in without
 * one, and fail there. Doctor now asks for it in a terminal, and checks it
 * against the certificate before it is used; without a terminal it says what
 * is missing.
 */
const pem = (passphrase) => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return Buffer.from(
    privateKey.export(
      passphrase
        ? { type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase }
        : { type: "pkcs8", format: "pem" },
    ),
  );
};

const hasOpenssl = (() => {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** A throwaway self-signed .pfx, made with openssl for the duration of the test */
const pfx = async (password) => {
  const dir = await mkdtemp(join(tmpdir(), "doctor-cert-"));
  const key = join(dir, "key.pem");
  const cert = join(dir, "cert.pem");
  const out = join(dir, "cert.pfx");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", cert, "-days", "1", "-nodes", "-subj", "/CN=doctor-test"], { stdio: "ignore" });
  execFileSync("openssl", ["pkcs12", "-export", "-out", out, "-inkey", key, "-in", cert, "-passout", `pass:${password}`], { stdio: "ignore" });
  return { path: out, contents: await readFile(out) };
};

test("an encrypted PEM key needs its passphrase, and is opened by it", () => {
  const locked = pem("secret");
  assert.equal(checkCertificatePassword(locked), "wrong");
  assert.equal(checkCertificatePassword(locked, "nope"), "wrong");
  assert.equal(checkCertificatePassword(locked, "secret"), "ok");
});

test("an unencrypted PEM key needs no password", () => {
  assert.equal(checkCertificatePassword(pem()), "ok");
});

test("a PEM without a private key cannot be told", () => {
  assert.equal(
    checkCertificatePassword(Buffer.from("-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----\n")),
    "unknown",
  );
});

test("something that is no certificate at all cannot be told", () => {
  assert.equal(checkCertificatePassword(Buffer.from("not a certificate")), "unknown");
});

test("a protected .pfx needs its password, and is opened by it", { skip: !hasOpenssl && "openssl is not installed" }, async () => {
  const { contents } = await pfx("secret");
  assert.equal(checkCertificatePassword(contents), "wrong");
  assert.equal(checkCertificatePassword(contents, "nope"), "wrong");
  assert.equal(checkCertificatePassword(contents, "secret"), "ok");
});

test("an unprotected .pfx needs no password", { skip: !hasOpenssl && "openssl is not installed" }, async () => {
  const { contents } = await pfx("");
  assert.equal(checkCertificatePassword(contents), "ok");
});

test("without a terminal, a missing password is reported before signing in", async () => {
  // The test runner gives this process no terminal, which is what a pipeline
  // looks like. Nothing reaches the sign-in: the error comes first.
  const dir = await mkdtemp(join(tmpdir(), "doctor-cert-"));
  const file = join(dir, "locked.pem");
  await writeFile(file, pem("secret"));

  await assert.rejects(
    Authenticate.init({ appId: "app", tenant: "tenant", certificate: file }),
    /protected with a password, and none was given.*DOCTOR_CERTIFICATE_PASSWORD/,
  );
});

test("the base64 form of a protected certificate is recognised too", async () => {
  await assert.rejects(
    Authenticate.init({
      appId: "app",
      tenant: "tenant",
      certificate: pem("secret").toString("base64"),
    }),
    /protected with a password, and none was given/,
  );
});
