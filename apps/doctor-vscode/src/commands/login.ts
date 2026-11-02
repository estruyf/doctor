import * as vscode from 'vscode';
import { AuthService } from '../auth/AuthService';
import { getAuthMode } from '../auth/authMode';
import { promptToConfigureIfMissing } from './configure';

// Callback set by extension.ts so login can trigger service init after sign-in
let onLoginSuccess: (() => Promise<void>) | null = null;

export function setOnLoginSuccess(cb: () => Promise<void>) {
  onLoginSuccess = cb;
}

export function registerLoginCommand(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand('doctor.login', async () => {
    if (getAuthMode() === 'certificate') {
      vscode.window.showInformationMessage(
        'Doctor is using certificate authentication from doctor.json — no interactive sign-in is needed.'
      );
      return;
    }

    try {
      const isConfigured = await promptToConfigureIfMissing();
      if (!isConfigured) {
        return;
      }

      const cfg = vscode.workspace.getConfiguration('doctor');
      const clientId = cfg.get<string>('clientId')!;
      const tenantId = cfg.get<string>('tenantId')!;
      const siteUrl = cfg.get<string>('siteUrl')!;

      const auth = new AuthService(clientId, tenantId, context);
      const token = await auth.getSharePointAccessToken(siteUrl);
      if (token) {
        vscode.window.showInformationMessage('Successfully signed in to Microsoft 365');
        // Re-initialize services now that we have a token
        if (onLoginSuccess) {
          await onLoginSuccess();
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Login failed: ${error}`);
    }
  });

  context.subscriptions.push(command);
}
