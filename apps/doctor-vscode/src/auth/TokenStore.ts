import * as vscode from 'vscode';

const TOKEN_KEY_PREFIX = 'doctor-token-';
const TOKEN_EXPIRY_PREFIX = 'doctor-token-expiry-';
const MSAL_CACHE_KEY_PREFIX = 'doctor-msal-cache-';

export class TokenStore {
  constructor(private context: vscode.ExtensionContext) {}

  async getAccessToken(tenantId: string): Promise<string | undefined> {
    return this.context.secrets.get(`${TOKEN_KEY_PREFIX}${tenantId}`);
  }

  async setAccessToken(tenantId: string, token: string, expiresOn?: Date | null): Promise<void> {
    await this.context.secrets.store(`${TOKEN_KEY_PREFIX}${tenantId}`, token);
    if (expiresOn) {
      await this.context.secrets.store(
        `${TOKEN_EXPIRY_PREFIX}${tenantId}`,
        expiresOn.getTime().toString()
      );
    }
  }

  async isAccessTokenValid(tenantId: string): Promise<boolean> {
    const token = await this.getAccessToken(tenantId);
    if (!token) { return false; }
    const expiryStr = await this.context.secrets.get(`${TOKEN_EXPIRY_PREFIX}${tenantId}`);
    if (!expiryStr) { return true; } // no expiry stored, assume valid
    const expiry = parseInt(expiryStr, 10);
    // Consider token expired 5 minutes early
    return Date.now() < expiry - 5 * 60 * 1000;
  }

  async getMsalCache(tenantId: string): Promise<string | undefined> {
    return this.context.secrets.get(`${MSAL_CACHE_KEY_PREFIX}${tenantId}`);
  }

  async setMsalCache(tenantId: string, cache: string): Promise<void> {
    await this.context.secrets.store(`${MSAL_CACHE_KEY_PREFIX}${tenantId}`, cache);
  }

  async deleteTokens(tenantId: string): Promise<void> {
    await this.context.secrets.delete(`${TOKEN_KEY_PREFIX}${tenantId}`);
    await this.context.secrets.delete(`${TOKEN_EXPIRY_PREFIX}${tenantId}`);
    await this.context.secrets.delete(`${MSAL_CACHE_KEY_PREFIX}${tenantId}`);
  }
}
