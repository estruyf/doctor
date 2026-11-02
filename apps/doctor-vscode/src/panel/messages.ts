// Messages sent FROM the extension TO the webview
export type ExtensionMessage =
  | {
      command: 'metadata';
      payload: {
        fields: FieldState[];
        fileName: string;
        fileUri: string;
        siteUrl?: string;
        schemaLoading: boolean;
        /** True while a background revalidation (startup or manual refresh)
         *  is in flight, re-fetching schema/term data that may already be
         *  showing (possibly stale) cached values. Distinct from
         *  `schemaLoading`, which only means "the cache was cold". */
        backgroundSyncing: boolean;
        sharePointStatus: SharePointStatus;
        sharePointMessage?: string;
      };
    }
  | { command: 'loading'; payload: boolean }
  | { command: 'notReady'; reason?: NotReadyReason };

export type NotReadyReason =
  | 'no-editor'
  | 'not-markdown'
  | 'not-doctor-project'
  | 'no-front-matter';

/** State of the SharePoint connection, independent of whether the panel can
 *  still show the basic doctor front-matter fields (it always can, as long
 *  as the file has parseable front matter). */
export type SharePointStatus =
  | 'ready'            // schema loaded (or loading in the background), fields fully editable
  | 'not-configured'   // no certificate/interactive auth configured yet
  | 'error';           // auth or schema fetch was attempted and failed

/** value/label pair for enum-like fields (dropdowns) — `value` is what gets
 *  written to front matter, `label` is only for display in the picker. */
export interface EnumOption {
  value: string;
  label: string;
}

export interface FieldState {
  internalName: string;
  title: string;
  description?: string;
  typeAsString: string;
  required: boolean;
  value: any;
  choices?: EnumOption[];      // for Choice fields
  termSetId?: string;         // for Taxonomy fields
  anchorId?: string;
  group?: 'page' | 'metadata'; // which section the field belongs to
  /** True for the fixed set of doctor-managed fields (DOCTOR_FIELD_MAPPINGS)
   *  — used to keep them pinned at the top of their section, above any
   *  custom/user-added fields, regardless of front matter or schema order. */
  isDoctorDefault?: boolean;
  /** True while this field's accurate type/choices are still being resolved
   *  from the (possibly cold) schema cache — the value shown is a best-effort
   *  guess in the meantime. */
  loading?: boolean;
  /** True when this field's accurate type/choices depend on the SharePoint
   *  schema, but SharePoint isn't (currently) reachable — the raw front
   *  matter value is still shown/editable as plain text. Distinct from
   *  `loading`, which implies a fetch is genuinely in flight. */
  spUnavailable?: boolean;
}

// Messages sent FROM the webview TO the extension
export type PanelMessage =
  | { command: 'ready' }
  | { command: 'updateField'; field: string; value: any; group?: 'page' | 'metadata'; fileUri: string }
  | { command: 'pickTerm'; field: string; fileUri: string; group?: 'page' | 'metadata' }
  | { command: 'pickUser'; field: string; fileUri: string; group?: 'page' | 'metadata' }
  | { command: 'refreshData' };
