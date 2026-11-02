import * as vscode from 'vscode';
import * as path from 'path';
import { parseFrontMatter } from '../utils/frontmatter';
import { FieldInfo } from '../types';
import { EnumOption, FieldState, PanelMessage, SharePointStatus } from './messages';
import { isInDoctorProject } from '../utils/doctorContext';
import { DOCTOR_FIELD_MAPPINGS, DOCTOR_FRONT_MATTER_KEYS } from '../utils/doctorMappings';
import { readDoctorJson } from '../utils/doctorConfig';
import { findDoctorJson } from '../utils/doctorContext';
import { collectMenuIds } from '../utils/menuIds';
import { staticParentIds } from '../config/menuItems';

// Friendly display labels for doctor's own hardcoded enum-like front matter
// values, keyed by front matter key. SharePoint schema rarely knows about
// these (they're pure doctor concepts, not real SharePoint Choice columns),
// so we supply them ourselves rather than leaving the dropdown empty.

/**
 * The menu ids the project's other pages use, offered as `parent` suggestions.
 *
 * Cached per project: this is a walk of the content folder, and the panel
 * re-renders on every keystroke that changes the front matter. The ids only
 * move when somebody edits a `menu` block, which the TTL picks up soon enough.
 */
const MENU_ID_TTL = 30_000;
const menuIdCache = new Map<string, { at: number; choices: EnumOption[] }>();

function menuIdChoices(document: vscode.TextDocument): EnumOption[] {
  const doctorJsonPath = findDoctorJson(path.dirname(document.uri.fsPath));
  if (!doctorJsonPath) {
    return [];
  }

  const cached = menuIdCache.get(doctorJsonPath);
  if (cached && Date.now() - cached.at < MENU_ID_TTL) {
    return cached.choices;
  }

  const config = readDoctorJson(doctorJsonPath);
  const folder = typeof config?.folder === 'string' && config.folder ? config.folder : './src';
  const contentFolder = path.resolve(path.dirname(doctorJsonPath), folder);

  // The static items in doctor.json come first: they are the top of the
  // navigation, so they are what most pages sit under
  const fromConfig = staticParentIds(config ?? {}).map((entry) => ({
    value: entry.id,
    label: `${entry.id} — ${entry.name ? `${entry.name}, ` : ''}doctor.json`,
  }));
  const taken = new Set(fromConfig.map((choice) => choice.value));
  const fromPages = collectMenuIds(contentFolder)
    .filter((entry) => !taken.has(entry.id))
    .map((entry) => ({
      value: entry.id,
      label: entry.page ? `${entry.id} — ${entry.page}` : entry.id,
    }));
  const choices = [...fromConfig, ...fromPages];

  menuIdCache.set(doctorJsonPath, { at: Date.now(), choices });
  return choices;
}

/** Forgets the collected ids, for when doctor.json or a page changes */
export function clearMenuIdCache(): void {
  menuIdCache.clear();
}

const DOCTOR_ENUM_CHOICES: Record<string, EnumOption[]> = {
  layout: [
    { value: 'Article', label: 'Article' },
    { value: 'Home', label: 'Home' },
  ],
  type: [
    { value: '', label: '— none —' },
    { value: 'translation', label: 'Translation' },
  ],
};

/** Converts SharePoint's raw string choices into value/label pairs. Real SP
 *  Choice columns use the same string for storage and display, so value ===
 *  label here — the split only matters for doctor's own hardcoded enums. */
function toEnumOptions(choices?: string[]): EnumOption[] | undefined {
  return choices?.map((c) => ({ value: c, label: c }));
}

export class PanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'doctor.panel';
  private static instance: PanelProvider | null = null;

  private view?: vscode.WebviewView;
  private disposables: vscode.Disposable[] = [];

  private schemaService: any = null;
  private siteUrl = '';
  // Set when SharePoint auth/service init or a schema fetch has failed, so
  // the panel can show a specific reason instead of just "not configured".
  // Cleared as soon as setServices() succeeds again.
  private sharePointError: string | null = null;
  // True while a background revalidation (startup sync or a manual "Refresh"
  // click) is in flight, driven by extension.ts via setSyncing() — surfaced
  // to the webview so the user can see stale-looking cached data is being
  // actively refreshed rather than assuming the extension is just stuck.
  private backgroundSyncing = false;

  // Tracks the fileUri of the most recent refresh() call, so a slow
  // background schema fetch that resolves after the user has switched to a
  // different file doesn't overwrite what's currently shown.
  private currentRequestUri: string | null = null;

  private constructor(private readonly extensionUri: vscode.Uri) {}

  public static getInstance(extensionUri: vscode.Uri): PanelProvider {
    if (!PanelProvider.instance) {
      PanelProvider.instance = new PanelProvider(extensionUri);
    }
    return PanelProvider.instance;
  }

  public setServices(schemaService: any, siteUrl: string) {
    this.schemaService = schemaService;
    this.siteUrl = siteUrl;
    this.sharePointError = null;
    this.refresh();
  }

  /** Called by extension.ts whenever SharePoint auth/service init fails, so
   *  the panel can keep showing the basic doctor fields (which never need
   *  SharePoint) while surfacing a concrete reason for the rest. */
  public setServicesError(message: string) {
    this.schemaService = null;
    this.siteUrl = '';
    this.sharePointError = message;
    this.refresh();
  }

  /** Called by extension.ts around a background schema/term-store
   *  revalidation (startup sync or manual refresh) so the panel can show a
   *  "Syncing…" indicator without disturbing whatever is already rendered
   *  from cache. */
  public setSyncing(syncing: boolean) {
    this.backgroundSyncing = syncing;
    this.refresh();
  }


  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')]
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (msg: PanelMessage) => this.handleMessage(msg),
      null,
      this.disposables
    );

    // Refresh when active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document === vscode.window.activeTextEditor?.document) {
          this.refresh();
        }
      })
    );
  }

  private async handleMessage(msg: PanelMessage) {
    try {
      switch (msg.command) {
        case 'ready':
          this.refresh();
          break;
        case 'updateField':
          await this.updateField(msg.fileUri, msg.field, msg.value, msg.group);
          break;
        case 'pickTerm':
          await vscode.commands.executeCommand('doctor.pickTerm', msg.field, undefined, msg.fileUri, msg.group);
          break;
        case 'pickUser':
          await vscode.commands.executeCommand('doctor.pickUser', msg.field, msg.fileUri, msg.group);
          break;
        case 'refreshData':
          await vscode.commands.executeCommand('doctor.refreshSchema');
          break;
      }
    } catch (error: any) {
      // The pick commands already surface their own error messages; this is a
      // last-resort net so a failure in any panel message handler is never
      // silently swallowed (an unhandled rejection here would otherwise just
      // vanish, since onDidReceiveMessage doesn't await/observe the result).
      console.error('[PanelProvider] handleMessage failed:', msg.command, error);
      vscode.window.showErrorMessage(`Doctor: ${error?.message ?? error}`);
    }
  }

  public async refresh() {
    if (!this.view) { return; }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      this.view.webview.postMessage({ command: 'notReady', reason: 'no-editor' });
      return;
    }
    if (editor.document.languageId !== 'markdown') {
      this.view.webview.postMessage({ command: 'notReady', reason: 'not-markdown' });
      return;
    }
    if (!isInDoctorProject(editor.document)) {
      this.view.webview.postMessage({ command: 'notReady', reason: 'not-doctor-project' });
      return;
    }

    const parsed = parseFrontMatter(editor.document);
    if (!parsed || !parsed.data) {
      this.view.webview.postMessage({ command: 'notReady', reason: 'no-front-matter' });
      return;
    }

    const requestUri = editor.document.uri.toString();
    this.currentRequestUri = requestUri;

    // Basic doctor fields (title, layout, draft, etc.) never depend on
    // SharePoint and must always render from front matter alone — SharePoint
    // is only needed for the Metadata section and for refining doctor-mapped
    // fields' types/choices. If services were never initialized (auth not
    // configured, or init failed), skip straight to a schema-less render
    // instead of blocking the whole panel.
    if (!this.schemaService || !this.siteUrl) {
      const status: SharePointStatus = this.sharePointError ? 'error' : 'not-configured';
      const fields = this.buildFieldStates(parsed.data, [], false, status, menuIdChoices(editor.document));
      this.postMetadata(editor, fields, false, status, this.sharePointError ?? undefined);
      return;
    }

    // Fast path: render immediately using whatever schema is already cached
    // (warm >99% of the time thanks to the 1h TTL), so switching files or
    // reloading doesn't blank the panel while re-awaiting a network call.
    const cachedSchema: FieldInfo[] | null = this.schemaService.peekColumnSchema(this.siteUrl);
    const schemaLoading = cachedSchema === null;
    const fields = this.buildFieldStates(parsed.data, cachedSchema ?? [], schemaLoading, 'ready', menuIdChoices(editor.document));

    this.postMetadata(editor, fields, schemaLoading, 'ready');

    if (!schemaLoading) { return; }

    // Cold cache: kick off the real fetch in the background and push a
    // corrected snapshot once it resolves, but only if the user hasn't since
    // navigated elsewhere (avoids clobbering a different file's panel state).
    try {
      const schemaFields = await this.schemaService.getColumnSchema(this.siteUrl);
      if (this.currentRequestUri !== requestUri) { return; }
      const freshParsed = parseFrontMatter(editor.document);
      if (!freshParsed?.data) { return; }
      const freshFields = this.buildFieldStates(freshParsed.data, schemaFields, false, 'ready', menuIdChoices(editor.document));
      this.postMetadata(editor, freshFields, false, 'ready');
    } catch (e: any) {
      console.error('[PanelProvider] getColumnSchema failed:', e);
      if (this.currentRequestUri !== requestUri) { return; }
      // Schema never resolved — surface this as an explicit error state
      // rather than silently clearing spinners. Fields already shown (built
      // from front matter alone) remain visible and editable.
      this.sharePointError = `Failed to load SharePoint schema: ${e?.message ?? e}`;
      const errorFields = this.buildFieldStates(parsed.data, [], false, 'error', menuIdChoices(editor.document));
      this.postMetadata(editor, errorFields, false, 'error', this.sharePointError);
    }
  }

  private postMetadata(
    editor: vscode.TextEditor,
    fields: FieldState[],
    schemaLoading: boolean,
    sharePointStatus: SharePointStatus,
    sharePointMessage?: string
  ) {
    if (!this.view) { return; }
    this.view.webview.postMessage({
      command: 'metadata',
      payload: {
        fields,
        fileName: path.basename(editor.document.fileName),
        fileUri: editor.document.uri.toString(),
        siteUrl: this.siteUrl || undefined,
        schemaLoading,
        backgroundSyncing: this.backgroundSyncing,
        sharePointStatus,
        sharePointMessage,
      }
    });
  }

  // System / internal SP field names to always skip in the "all schema fields" section
  private static readonly SP_SYSTEM_FIELDS = new Set([
    'CanvasContent1', 'LayoutWebpartsContent', '_ColorTag', 'ComplianceAssetId',
    'WikiField', 'BannerImageUrl', 'PromotedState', 'LinkTitle',
    'LinkFilenameNoMenu', 'LinkFilename', 'DocIcon', 'FileSizeDisplay',
    'Edit', '_UIVersionString', 'ItemChildCount', 'FolderChildCount',
    'AppAuthor', 'AppEditor', 'ParentVersionString', 'ParentLeafName',
    '_CommentCount', '_LikeCount', '_DisplayName', '_IsRecord',
    '_ComplianceFlags', '_ComplianceTag', '_ComplianceTagWrittenTime',
    '_ComplianceTagUserId', '_CopySource', 'CheckoutUser', '_CheckinComment',
    'ID', 'ContentType', 'Author', 'Editor',
    '_OriginalSourceUrl', '_OriginalSourceSiteId', '_OriginalSourceWebId',
    '_OriginalSourceListId', '_OriginalSourceItemId',
    '_SPSitePageFlags', '_SPCallToAction',
    // Set automatically by SharePoint when a page is first published/
    // promoted to news — never user-editable and never written by doctor.
    'FirstPublishedDate',
    // Maintained entirely by SharePoint itself on every save/edit — never
    // user-editable and never written by doctor.
    'Created', 'Modified',
    // TODO: `AuthorByLine` is a real, user-editable page byline field (not
    // system-maintained like the ones above), so it's currently left
    // exposed as a generic schema field. Revisit once the new doctor sync
    // is tested — we may need to exclude it here (or add it to
    // doctorMappings.ts as a UPN-based multi-user field) depending on
    // whether doctor's sync ends up managing/overwriting it itself.
  ]);

  /**
   * Pure/synchronous field-list builder. `schemaFields` may be `[]` either
   * because the schema cache is cold (still fetching — `schemaLoading:
   * true`) or because SharePoint isn't ready at all (`sharePointStatus !==
   * 'ready'`). In the latter case schema-dependent entries are marked
   * `spUnavailable: true` instead of `loading`, since no fetch is in flight —
   * fallback types/values are still shown from front matter either way.
   */
  private buildFieldStates(
    topLevel: Record<string, any>,
    schemaFields: FieldInfo[],
    schemaLoading: boolean,
    sharePointStatus: SharePointStatus,
    menuIds: EnumOption[] = []
  ): FieldState[] {
    const schemaMap = new Map(schemaFields.map((f) => [f.internalName, f]));
    const SP_SYSTEM_FIELDS = PanelProvider.SP_SYSTEM_FIELDS;
    const spReady = sharePointStatus === 'ready';

    // Metadata fields may be nested under a `metadata:` key
    const metadataData: Record<string, any> =
      topLevel.metadata && typeof topLevel.metadata === 'object'
        ? topLevel.metadata
        : {};

    const result: FieldState[] = [];

    // ── Section 1: Doctor hardcoded mappings ────────────────────────────────
    // Always show every DOCTOR_FIELD_MAPPINGS entry, even when the key isn't
    // present in this file's front matter yet (matching how SP metadata
    // fields are always listed below) — otherwise there'd be no way to
    // discover/add optional doctor fields like `header` or `partials`
    // through the panel; they'd only ever appear after being hand-typed
    // into the markdown first.
    for (const mapping of DOCTOR_FIELD_MAPPINGS) {
      const spField = mapping.spInternalName ? schemaMap.get(mapping.spInternalName) : undefined;
      // A doctor concept with no SharePoint equivalent (spInternalName: null)
      // never needs schema to render correctly, so it's never "loading" or
      // "unavailable" — it's always fully usable.
      const dependsOnSchema = !!mapping.spInternalName;
      result.push({
        internalName: mapping.frontMatterKey,
        title: mapping.label,
        description: mapping.description,
        typeAsString: spField?.TypeAsString ?? mapping.fallbackType,
        required: spField?.Required ?? false,
        value: topLevel[mapping.frontMatterKey],
        choices:
          mapping.frontMatterKey === 'menu'
            ? menuIds
            : toEnumOptions(spField?.choices) ?? DOCTOR_ENUM_CHOICES[mapping.frontMatterKey],
        termSetId: spField?.TermSetId,
        anchorId: spField?.AnchorId,
        group: 'page',
        isDoctorDefault: true,
        loading: dependsOnSchema && schemaLoading,
        spUnavailable: dependsOnSchema && !spReady,
      });
    }

    // Any top-level keys not covered by doctor mappings and not 'metadata'
    const handledTopLevel = new Set([...DOCTOR_FRONT_MATTER_KEYS, 'metadata']);
    for (const key of Object.keys(topLevel)) {
      if (handledTopLevel.has(key) || SP_SYSTEM_FIELDS.has(key)) { continue; }
      const spField = schemaMap.get(key);
      result.push({
        internalName: key,
        title: spField?.title ?? key,
        typeAsString: spField?.TypeAsString ?? 'Text',
        required: spField?.Required ?? false,
        value: topLevel[key],
        choices: toEnumOptions(spField?.choices),
        termSetId: spField?.TermSetId,
        anchorId: spField?.AnchorId,
        group: 'page',
        loading: schemaLoading,
        spUnavailable: !spReady,
      });
    }

    // ── Section 2: SharePoint metadata fields ────────────────────────────────
    // Show all schema fields that are not hidden and not system fields,
    // regardless of whether they currently have a value in the front matter.
    const metadataFieldNames = new Set(Object.keys(metadataData));
    // Also include schema fields so user can see/add all available SP fields
    const spFieldsToShow = schemaFields.filter(
      (f) =>
        !f.Hidden &&
        !SP_SYSTEM_FIELDS.has(f.internalName) &&
        // Skip fields already shown via doctor mappings (by SP internal name)
        !DOCTOR_FIELD_MAPPINGS.some((m) => m.spInternalName === f.internalName)
    );

    for (const f of spFieldsToShow) {
      result.push({
        internalName: f.internalName,
        title: f.title || f.internalName,
        description: f.description,
        typeAsString: f.TypeAsString,
        required: f.Required,
        value: metadataData[f.internalName] ?? null,
        choices: toEnumOptions(f.choices),
        termSetId: f.TermSetId,
        anchorId: f.AnchorId,
        group: 'metadata',
      });
    }

    // Fallback: while the schema is cold, unavailable, or failed to load but
    // the file already has metadata values, show those raw keys so the
    // section isn't empty — they get replaced with the real schema-driven
    // entries above once the schema resolves.
    if (spFieldsToShow.length === 0 && metadataFieldNames.size > 0) {
      for (const key of metadataFieldNames) {
        if (SP_SYSTEM_FIELDS.has(key)) { continue; }
        result.push({
          internalName: key,
          title: key,
          typeAsString: 'Text',
          required: false,
          value: metadataData[key],
          group: 'metadata',
          loading: schemaLoading,
          spUnavailable: !spReady,
        });
      }
    }

    // Enforce doctor-default fields first, then custom fields, within each
    // section — explicitly, rather than relying on the order fields
    // happened to be pushed above. Array.prototype.sort is stable (ES2019+),
    // so this only ever moves defaults ahead of customs; it never reorders
    // two fields of the same kind relative to each other. This guarantees
    // the invariant holds even if a future change adds another field source
    // (e.g. a new loop, or fields arriving in a different order) without
    // that change needing to remember to preserve ordering itself.
    result.sort((a, b) => Number(!!b.isDoctorDefault) - Number(!!a.isDoctorDefault));

    return result;
  }

  private async updateField(fileUri: string, fieldName: string, value: any, group?: 'page' | 'metadata') {
    // Resolve the document by its explicit URI rather than the active editor —
    // the active editor may have already moved on to a different file by the
    // time this message is handled (e.g. a text field's onBlur fires right as
    // the user switches tabs), which would otherwise write to the wrong file.
    const document = await this.resolveDocument(fileUri);

    const { updateField } = await import('../utils/frontmatter');

    if (group === 'metadata') {
      // Write inside the metadata: block — prefix field name with 'metadata.'
      // so updateField can resolve the correct path in the YAML
      await updateField(document, fieldName, value, 'metadata');
    } else {
      await updateField(document, fieldName, value);
    }
  }

  /**
   * Resolves a document from a webview-supplied fileUri string, tolerating
   * documents that are no longer the active editor (or not visible at all).
   * Throws (rather than silently returning null) so a failure to resolve the
   * target file is never a silent no-op — it bubbles up to handleMessage's
   * catch, which surfaces it via showErrorMessage.
   */
  private async resolveDocument(fileUri: string): Promise<vscode.TextDocument> {
    if (!fileUri) {
      throw new Error('Cannot save this field: no target file was specified (try reopening the file).');
    }
    try {
      const uri = vscode.Uri.parse(fileUri);
      return await vscode.workspace.openTextDocument(uri);
    } catch (e: any) {
      throw new Error(`Could not open "${fileUri}" to save the change: ${e?.message ?? e}`, { cause: e });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'panel.js')
    );
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Doctor</title>
  <style>
    body { margin: 0; padding: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); }
    button { font-family: inherit; }
    @keyframes doctor-spin { to { transform: rotate(360deg); } }
    .doctor-field-row + .doctor-field-row { border-top: 1px solid rgba(128, 128, 128, 0.12); }
    .doctor-field-row:hover { background: rgba(128, 128, 128, 0.05); }
    input:focus, select:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
