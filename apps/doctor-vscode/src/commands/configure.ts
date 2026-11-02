import * as vscode from 'vscode';

// FALLBACK AUTH PATH configuration — these settings are only used when no
// doctor.json with complete certificate auth settings (appId/tenant/certificate/url)
// can be found. See CertificateAuthProvider / doctorConfig.ts for the primary path.
const CONFIG_SECTION = 'doctor-metadata';

function getMissingConfigKeys() {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const siteUrl = config.get<string>('siteUrl');
  const tenantId = config.get<string>('tenantId');
  const clientId = config.get<string>('clientId');

  const missing: string[] = [];
  if (!siteUrl) { missing.push('siteUrl'); }
  if (!tenantId) { missing.push('tenantId'); }
  if (!clientId) { missing.push('clientId'); }
  return { missing, siteUrl, tenantId, clientId };
}

export async function promptToConfigureIfMissing(): Promise<boolean> {
  const { missing } = getMissingConfigKeys();
  if (missing.length === 0) {
    return true;
  }

  const selection = await vscode.window.showWarningMessage(
    `Missing Doctor settings: ${missing.map((key) => `${CONFIG_SECTION}.${key}`).join(', ')}`,
    'Configure now'
  );

  if (selection !== 'Configure now') {
    return false;
  }

  await vscode.commands.executeCommand('doctor-metadata.configure');
  return getMissingConfigKeys().missing.length === 0;
}

export function registerConfigureCommand(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('doctor-metadata.configure', async () => {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);

    const currentSiteUrl = config.get<string>('siteUrl') ?? '';
    const siteUrl = await vscode.window.showInputBox({
      title: 'Doctor: Configure fallback sign-in',
      prompt: 'SharePoint site URL (only used when no doctor.json certificate auth is found)',
      placeHolder: 'https://contoso.sharepoint.com/sites/docs',
      value: currentSiteUrl,
      ignoreFocusOut: true
    });
    if (!siteUrl) {
      return;
    }

    const currentTenantId = config.get<string>('tenantId') ?? '';
    const tenantId = await vscode.window.showInputBox({
      title: 'Doctor: Configure fallback sign-in',
      prompt: 'Tenant ID or domain',
      placeHolder: 'contoso.onmicrosoft.com',
      value: currentTenantId,
      ignoreFocusOut: true
    });
    if (!tenantId) {
      return;
    }

    const currentClientId = config.get<string>('clientId') ?? '';
    const clientId = await vscode.window.showInputBox({
      title: 'Doctor: Configure fallback sign-in',
      prompt: 'Entra app client ID',
      placeHolder: '00000000-0000-0000-0000-000000000000',
      value: currentClientId,
      ignoreFocusOut: true
    });
    if (!clientId) {
      return;
    }

    await config.update('siteUrl', siteUrl, vscode.ConfigurationTarget.Global);
    await config.update('tenantId', tenantId, vscode.ConfigurationTarget.Global);
    await config.update('clientId', clientId, vscode.ConfigurationTarget.Global);

    vscode.window.showInformationMessage('Doctor fallback sign-in settings saved.');
  });

  context.subscriptions.push(command);
}
