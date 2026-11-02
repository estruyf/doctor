import * as vscode from 'vscode';
import { AuthService } from '../auth/AuthService';
import { getAuthMode } from '../auth/authMode';

export function registerLogoutCommand(context: vscode.ExtensionContext, authService: AuthService) {
  const command = vscode.commands.registerCommand('doctor.logout', async () => {
    if (getAuthMode() === 'certificate') {
      vscode.window.showInformationMessage(
        'Doctor is using certificate authentication from doctor.json — there is no interactive session to sign out of.'
      );
      return;
    }

    try {
      const tenantId = vscode.workspace.getConfiguration('doctor').get<string>('tenantId');

      if (!tenantId) {
        vscode.window.showErrorMessage('Tenant ID not configured');
        return;
      }

      await authService.logout(tenantId);
      vscode.window.showInformationMessage('Successfully signed out');
    } catch (error) {
      vscode.window.showErrorMessage(`Logout failed: ${error}`);
    }
  });

  context.subscriptions.push(command);
}

