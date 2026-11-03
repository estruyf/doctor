/**
 * The commands of the doctor CLI. The extension starts `publish` and `status`
 * itself, so a renamed command breaks its buttons, not just doctor's help text.
 */
export enum Command {
  init = "init",
  publish = "publish",
  workflow = "workflow",
  version = "version",
  setup = "setup",
  cleanup = "cleanup",
  status = "status",
}

/**
 * Publishes every page, changed or not. The extension's "Publish all pages"
 * starts doctor with it.
 */
export const FORCE_ALL_OPTION = "--forceAll";

/**
 * The environment variable doctor reads the certificate password from when
 * neither `--password` nor doctor.json supplies one. Named after the
 * `CERTIFICATE_PASSWORD` secret the `workflow` command already sets up, so the
 * two read as the same value. The extension hands the password it stored over
 * in it; doctor 2.3.0 and later read it, an older doctor asks for it itself.
 */
export const CERTIFICATE_PASSWORD_ENV = "DOCTOR_CERTIFICATE_PASSWORD";
