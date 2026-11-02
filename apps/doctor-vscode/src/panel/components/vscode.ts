import { PanelMessage } from '../messages';

 
declare function acquireVsCodeApi(): {
  postMessage(msg: any): void;
  getState(): any;
  setState(state: any): void;
};

const vscode = acquireVsCodeApi();

export function sendMessage(msg: PanelMessage) {
  vscode.postMessage(msg);
}

/**
 * Persists small bits of webview-local UI state (e.g. which sections are
 * collapsed) across the panel being hidden/shown or VS Code being reloaded,
 * using the same acquireVsCodeApi() state slot VS Code preserves for webview
 * views. Stored as one flat object under a single key per concern.
 */
export function getUiState<T>(key: string, fallback: T): T {
  const all = vscode.getState() ?? {};
  return key in all ? all[key] : fallback;
}

export function setUiState<T>(key: string, value: T): void {
  const all = vscode.getState() ?? {};
  vscode.setState({ ...all, [key]: value });
}
