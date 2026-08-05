export interface PartialsSettings {
  /**
   * The folder in which the reusable markdown snippets are stored.
   */
  folder?: string;
  /**
   * Partial which gets prepended to every page.
   */
  header?: string;
  /**
   * Partial which gets appended to every page.
   */
  footer?: string;
}

/**
 * Page level opt-out for the automatically injected partials. Use `false` to
 * skip all of them, or disable them one by one.
 */
export type PagePartials =
  | boolean
  | {
      header?: boolean;
      footer?: boolean;
    };
