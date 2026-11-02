/**
 * Doctor (doctor-tools/doctor) uses a fixed set of front matter keys that map
 * to specific SharePoint Site Page fields.
 *
 * Each entry describes:
 *  - `frontMatterKey`  — the key used in the markdown front matter
 *  - `spInternalName`  — the SharePoint field internal name (for schema lookup)
 *  - `fallbackType`    — field type to use when schema lookup fails
 *  - `label`           — human-readable label shown in the panel
 *  - `description`     — optional tooltip / hint
 */
export interface DoctorFieldMapping {
  frontMatterKey: string;
  spInternalName: string | null;  // null = no SP equivalent, pure doctor concept
  fallbackType: string;
  label: string;
  description?: string;
  /**
   * How a "User"-typed field's value should be resolved/written:
   *  - 'upn' (default) — a UPN string, resolved via SharePoint's
   *    site-scoped _api/web/siteusers search (a UPN is derived from the
   *    matched user's claims LoginName). Matches custom Person/Group
   *    columns, which doctor itself converts to a claims string at sync
   *    time.
   *  - 'siteUserId' — a raw integer ID from the *site's own* User
   *    Information List, resolved via SharePoint's site-scoped
   *    _api/web/siteusers search. Required for the reserved system
   *    Author/AuthorId column, which SharePoint does not accept a UPN for,
   *    and which is inherently site-specific (a user must have visited or
   *    be a member of the site to have an ID there).
   */
  valueKind?: 'upn' | 'siteUserId';
}

export const DOCTOR_FIELD_MAPPINGS: DoctorFieldMapping[] = [
  {
    frontMatterKey: 'title',
    spInternalName: 'Title',
    fallbackType: 'Text',
    label: 'Title',
    description: 'Page title shown in SharePoint and the browser tab',
  },
  {
    frontMatterKey: 'description',
    spInternalName: 'Description',
    fallbackType: 'Note',
    label: 'Description',
    description: 'Page description / summary',
  },
  {
    frontMatterKey: 'draft',
    spInternalName: null,
    fallbackType: 'Boolean',
    label: 'Draft',
    description: 'When true, doctor skips publishing this page',
  },
  {
    frontMatterKey: 'layout',
    spInternalName: 'PageLayoutType',
    fallbackType: 'Choice',
    label: 'Layout',
    description: 'SharePoint page layout (Article, Home, …)',
  },
  {
    frontMatterKey: 'comments',
    spInternalName: null,
    fallbackType: 'Boolean',
    label: 'Comments',
    description: 'Enable/disable page commenting. Overrides the site-wide setting.',
  },
  {
    frontMatterKey: 'template',
    spInternalName: null,
    fallbackType: 'Text',
    label: 'Template',
    description: 'Title of the page template to use for this page',
  },
  {
    frontMatterKey: 'type',
    spInternalName: null,
    fallbackType: 'DoctorPageType',
    label: 'Page type',
    description: 'Only used on localization pages — marks this page as a translation',
  },
  {
    frontMatterKey: 'menu',
    spInternalName: null,
    fallbackType: 'DoctorMenu',
    label: 'Menu',
    description: 'Navigation entry for this page (QuickLaunch / TopNavigationBar)',
  },
  {
    frontMatterKey: 'partials',
    spInternalName: null,
    fallbackType: 'DoctorPartials',
    label: 'Partials',
    description: 'Opt out of the header/footer partials injected on every page',
  },
  {
    frontMatterKey: 'localization',
    spInternalName: null,
    fallbackType: 'DoctorJson',
    label: 'Localization',
    description: 'Linked localization pages, keyed by locale name',
  },
  {
    frontMatterKey: 'header',
    spInternalName: null,
    fallbackType: 'DoctorHeader',
    label: 'Header',
    description: 'Doctor page header configuration (type, image, layout, …)',
  },
  {
    frontMatterKey: 'slug',
    spInternalName: 'FileLeafRef',
    fallbackType: 'Text',
    label: 'Slug / filename',
    description: 'URL slug — maps to the page filename in SharePoint',
  },
  {
    frontMatterKey: 'author',
    spInternalName: 'Author',
    fallbackType: 'User',
    label: 'Author',
    description: 'Page author — a SharePoint site user ID (must be a member of / have visited this site)',
    valueKind: 'siteUserId',
  },
];

/** Set of front matter keys managed by the doctor mappings. */
export const DOCTOR_FRONT_MATTER_KEYS = new Set(
  DOCTOR_FIELD_MAPPINGS.map((m) => m.frontMatterKey)
);
