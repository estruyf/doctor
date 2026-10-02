import { createPrivateKey } from "crypto";
import { createSecureContext } from "tls";

/**
 * What a password does to a certificate: opens it, does not, or cannot be told.
 *
 * - `ok`: the certificate opens with it — or needs none, for a PEM whose key
 *   is not encrypted.
 * - `wrong`: it does not open with it. Without a password, that means it needs
 *   one.
 * - `unknown`: it could not be read here at all, in a format or with an
 *   algorithm this Node.js cannot open. The sign-in is left to find out.
 */
export type CertificatePasswordCheck = "ok" | "wrong" | "unknown";

/**
 * Whether a password opens a certificate, worked out locally, before anything
 * is sent anywhere.
 *
 * A `.pfx`/`.p12` is opened with `tls.createSecureContext`, which answers
 * "mac verify failure" for a missing or wrong password. A PEM is opened with
 * `crypto.createPrivateKey`: an encrypted key fails without its passphrase, an
 * unencrypted one ignores whatever it is given.
 *
 * @param contents the certificate file, or its base64 contents decoded
 * @param password the password to try, or none
 */
export const checkCertificatePassword = (
  contents: Buffer,
  password?: string,
): CertificatePasswordCheck => {
  const text = contents.toString("utf8");

  if (text.includes("-----BEGIN")) {
    if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) {
      return "unknown";
    }

    try {
      createPrivateKey({ key: text, passphrase: password });
      return "ok";
    } catch (e: any) {
      const reason = `${e?.code || ""} ${e?.message || ""}`.toLowerCase();
      return /interrupted or cancelled|bad decrypt|bad password|passphrase/.test(reason)
        ? "wrong"
        : "unknown";
    }
  }

  try {
    createSecureContext({ pfx: contents, passphrase: password });
    return "ok";
  } catch (e: any) {
    return /mac verify failure/i.test(`${e?.message || ""}`)
      ? "wrong"
      : "unknown";
  }
};
