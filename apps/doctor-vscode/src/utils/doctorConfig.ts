import * as fs from 'fs';
import * as path from 'path';

/**
 * Shape of the subset of doctor.json fields relevant to authentication.
 * doctor.json can contain many more fields (markdown, siteDesign, menu, ...)
 * which are irrelevant here and simply ignored.
 * See: https://getdoctor.io/docs/configuration/doctor-json/
 */
export interface DoctorJsonConfig {
  url?: string;
  appId?: string;
  tenant?: string;
  auth?: string;
  certificate?: string;
  /** Plaintext password for the certificate, as read by doctor itself. */
  password?: string;
  [key: string]: any;
}

const CERTIFICATE_FILE_EXTENSIONS = ['.pfx', '.p12', '.pem'];

/**
 * Reads and parses a doctor.json file. Returns null if it can't be read or parsed.
 */
export function readDoctorJson(doctorJsonPath: string): DoctorJsonConfig | null {
  try {
    const raw = fs.readFileSync(doctorJsonPath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** The certificate-auth-relevant settings resolved from a doctor.json file. */
export interface ResolvedDoctorCertificateAuth {
  doctorJsonPath: string;
  siteUrl: string;
  appId: string;
  tenant: string;
  /** Absolute path to the certificate file, when `certificate` looked like a file path. */
  certificatePath?: string;
  /** Raw base64-encoded certificate contents, when `certificate` wasn't a file path. */
  certificateBase64?: string;
  /** Certificate password, read straight from doctor.json's own "password" field, if present. */
  password?: string;
}

/**
 * Resolves the certificate authentication settings (appId, tenant, certificate, url)
 * from a doctor.json file, the same way `doctor` itself does
 * (see certificate-authentication docs). Returns null when any of the required
 * fields (url, appId, tenant, certificate) are missing — the caller should then
 * fall back to the legacy interactive auth path.
 */
export function resolveDoctorCertificateAuth(doctorJsonPath: string): ResolvedDoctorCertificateAuth | null {
  const cfg = readDoctorJson(doctorJsonPath);
  if (!cfg) { return null; }

  const { url, appId, tenant, certificate, password } = cfg;
  if (!url || !appId || !tenant || !certificate) {
    return null;
  }

  const looksLikeFile = CERTIFICATE_FILE_EXTENSIONS.some((ext) =>
    certificate.toLowerCase().endsWith(ext)
  );

  if (looksLikeFile) {
    const baseDir = path.dirname(doctorJsonPath);
    const certificatePath = path.isAbsolute(certificate)
      ? certificate
      : path.join(baseDir, certificate);
    return { doctorJsonPath, siteUrl: url, appId, tenant, certificatePath, password };
  }

  return { doctorJsonPath, siteUrl: url, appId, tenant, certificateBase64: certificate, password };
}
