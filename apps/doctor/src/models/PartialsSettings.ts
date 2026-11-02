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
 * The parameters of a partial, passed with the attributes of its include tag.
 */
export interface PartialParams {
  [name: string]: string;
}

/**
 * The front matter of a partial. Only its `params` are used, which hold the
 * default values of the parameters the partial uses.
 */
export interface PartialFrontMatter {
  params?: { [name: string]: string | number | boolean | null };
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
