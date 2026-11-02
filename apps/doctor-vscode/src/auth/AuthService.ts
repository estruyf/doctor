import * as vscode from 'vscode';
import { PublicClientApplication, LogLevel, ICachePlugin, TokenCacheContext } from '@azure/msal-node';
import { TokenStore } from './TokenStore';

/**
 * FALLBACK AUTH PATH — interactive device code sign-in.
 *
 * The primary authentication path for this extension is certificate-based
 * (application-only) authentication configured via the project's doctor.json,
 * see `CertificateAuthProvider`. This interactive path only kicks in when no
 * doctor.json (or an incomplete one) can be found, so the extension still
 * works standalone, e.g. outside of a doctor project, or during setup.
 *
 * This will likely be superseded once certificate configuration can be shared
 * with/managed by doctor itself; kept here for now as a manual fallback.
 */
export class AuthService {
  private pca: PublicClientApplication;
  private tokenStore: TokenStore;

  constructor(
    clientId: string,
    tenantId: string,
    context: vscode.ExtensionContext
  ) {
    this.tokenStore = new TokenStore(context);

    // Cache plugin persists MSAL token cache to VS Code secret storage
    const cachePlugin: ICachePlugin = {
      beforeCacheAccess: async (cacheContext: TokenCacheContext) => {
        const cached = await this.tokenStore.getMsalCache(tenantId);
        if (cached) {
          cacheContext.tokenCache.deserialize(cached);
        }
      },
      afterCacheAccess: async (cacheContext: TokenCacheContext) => {
        if (cacheContext.cacheHasChanged) {
          await this.tokenStore.setMsalCache(tenantId, cacheContext.tokenCache.serialize());
        }
      }
    };

    this.pca = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`
      },
      cache: { cachePlugin },
      system: {
        loggerOptions: {
          loggerCallback(loglevel, message) {
            if (loglevel === LogLevel.Error) {
              console.error('[Auth]', message);
            }
          },
          piiLoggingEnabled: false,
          logLevel: LogLevel.Error
        }
      }
    });
  }

  private sharePointScopes(siteUrl: string): string[] {
    const host = new URL(siteUrl).origin; // e.g. https://contoso.sharepoint.com
    return [`${host}/Sites.Read.All`];
  }

  /**
   * Returns a SharePoint-scoped token silently or null if not signed in / token expired.
   * Never triggers interactive device code flow.
   */
  async getSharePointToken(siteUrl: string): Promise<string | null> {
    try {
      const accounts = await this.pca.getTokenCache().getAllAccounts();
      if (accounts.length === 0) { return null; }

      const response = await this.pca.acquireTokenSilent({
        account: accounts[0],
        scopes: this.sharePointScopes(siteUrl)
      });
      return response?.accessToken ?? null;
    } catch (error) {
      console.warn('Silent SharePoint token acquisition failed:', error);
    }
    return null;
  }

  /**
   * Returns a SharePoint-scoped token, prompting via device code flow if not already signed in.
   * Only call this from the explicit login command.
   */
  async getSharePointAccessToken(siteUrl: string): Promise<string> {
    const silent = await this.getSharePointToken(siteUrl);
    if (silent) { return silent; }

    return new Promise((resolve, reject) => {
      this.pca.acquireTokenByDeviceCode({
        deviceCodeCallback: (response) => {
          const message = `To sign in, use a web browser to visit ${response.verificationUri} and enter code ${response.userCode}`;
          vscode.window.showInformationMessage(message, 'Open Browser', 'Copy Code').then((selection) => {
            if (selection === 'Open Browser') {
              vscode.env.openExternal(vscode.Uri.parse(response.verificationUri));
            } else if (selection === 'Copy Code') {
              vscode.env.clipboard.writeText(response.userCode).then(() => {
                vscode.window.showInformationMessage(
                  `Code ${response.userCode} copied! Visit ${response.verificationUri} to sign in.`,
                  'Open Browser'
                ).then((sel) => {
                  if (sel === 'Open Browser') {
                    vscode.env.openExternal(vscode.Uri.parse(response.verificationUri));
                  }
                });
              });
            }
          });
        },
        scopes: this.sharePointScopes(siteUrl)
      }).then(async (result) => {
        if (result) {
          resolve(result.accessToken);
        } else {
          reject(new Error('Failed to acquire token'));
        }
      }).catch(reject);
    });
  }

  async logout(tenantId: string): Promise<void> {
    await this.tokenStore.deleteTokens(tenantId);
  }
}
