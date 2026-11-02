/**
 * Tracks which authentication path the extension is currently using, so
 * commands (login/logout) that only make sense for the interactive fallback
 * path can no-op / explain themselves when certificate auth is active.
 */
export type AuthMode = 'certificate' | 'interactive' | 'unconfigured';

let currentMode: AuthMode = 'unconfigured';

export function setAuthMode(mode: AuthMode): void {
  currentMode = mode;
}

export function getAuthMode(): AuthMode {
  return currentMode;
}
