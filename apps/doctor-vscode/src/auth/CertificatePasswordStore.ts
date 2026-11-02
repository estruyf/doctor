import * as vscode from 'vscode';

const CERT_PASSWORD_PREFIX = 'doctor-metadata-cert-password-';

/**
 * Securely stores/retrieves certificate passwords the user enters interactively
 * when doctor.json's "password" field is left empty (e.g. so it isn't committed
 * to source control). Backed by VS Code's SecretStorage — the same mechanism
 * TokenStore uses for the interactive-auth token cache.
 */
export class CertificatePasswordStore {
  constructor(private context: vscode.ExtensionContext) {}

  /**
   * The id a project's certificate password is stored under.
   *
   * One definition, because two parts of the extension use it: the panel
   * stores the password the first time it signs in, and the doctor commands
   * read it back to hand to doctor. Spelled two ways, the second would simply
   * never find what the first stored.
   */
  static idFor(doctorJsonPath: string, appId: string): string {
    return `${doctorJsonPath}:${appId}`;
  }

  private key(id: string): string {
    return `${CERT_PASSWORD_PREFIX}${id}`;
  }

  async get(id: string): Promise<string | undefined> {
    return this.context.secrets.get(this.key(id));
  }

  async set(id: string, password: string): Promise<void> {
    await this.context.secrets.store(this.key(id), password);
  }

  async delete(id: string): Promise<void> {
    await this.context.secrets.delete(this.key(id));
  }
}
