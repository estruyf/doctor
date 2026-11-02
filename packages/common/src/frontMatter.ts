/**
 * The front matter keys doctor reads from a page. Custom columns go under
 * `metadata`; every other key here has a meaning of its own, which the
 * extension's side panel edits.
 */
export const FRONT_MATTER_KEYS = [
  "title",
  "description",
  "slug",
  "draft",
  "homepage",
  "comments",
  "header",
  "menu",
  "template",
  "layout",
  "localization",
  "metadata",
  "partials",
  "author",
  "type",
] as const;

export type FrontMatterKey = (typeof FRONT_MATTER_KEYS)[number];
