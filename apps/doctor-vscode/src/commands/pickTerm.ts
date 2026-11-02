import * as vscode from 'vscode';
import { TermStoreService } from '../graph/TermStoreService';
import { updateField, getFieldNameAtLine, resolveFieldParentKey } from '../utils/frontmatter';
import { isMultiField } from '../utils/fieldTypes';
import { FieldInfo, TermInfo } from '../types';

export async function runPickTerm(
  fieldName: string | undefined,
  termSetId: string | undefined,
  termStoreService: TermStoreService,
  schemaService: any,
  document?: vscode.TextDocument,
  group?: 'page' | 'metadata',
  siteUrl?: string
): Promise<void> {
  // Prefer the explicit document (passed when invoked from the panel, tied to
  // the file the field actually belongs to) over the active editor, which may
  // have already changed by the time this runs.
  const targetDocument = document ?? vscode.window.activeTextEditor?.document;
  if (!targetDocument) {
    return;
  }

  // The caller (extension.ts) passes the site URL resolved from doctor.json's
  // certificate auth config. Only fall back to the legacy VS Code setting
  // when that isn't available (e.g. interactive-auth fallback path).
  const resolvedSiteUrl =
    siteUrl || vscode.workspace.getConfiguration('doctor').get<string>('siteUrl');
  if (!resolvedSiteUrl) {
    vscode.window.showErrorMessage('Site URL not configured');
    return;
  }

  let terms: TermInfo[] | null;
  let field: FieldInfo | undefined;
  try {
    const fields = await schemaService.getColumnSchema(resolvedSiteUrl);

    // If no fieldName passed (e.g. invoked from palette), try cursor line first.
    // This path is only reachable via the active editor (no explicit document
    // was passed), since the panel always supplies a fieldName.
    if (!fieldName) {
      const cursorLine = vscode.window.activeTextEditor?.selection.active.line ?? 0;
      const nameAtCursor = getFieldNameAtLine(targetDocument, cursorLine);
      if (nameAtCursor && nameAtCursor !== 'metadata') {
        fieldName = nameAtCursor;
      } else {
        vscode.window.showErrorMessage('Place cursor on a metadata field line (e.g. TaxSingleValue:)');
        return;
      }
    }

    // Look up schema info — may be undefined for fields not in schema (that's fine)
    field = fields.find((f: FieldInfo) => f.internalName === fieldName);

    const fieldLabel = field?.title || fieldName || 'field';
    terms = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading terms for "${fieldLabel}"…`,
        cancellable: false
      },
      async () => {
        const resolvedTermSetId = termSetId || field?.TermSetId;
        if (resolvedTermSetId) {
          return termStoreService.getTerms(resolvedTermSetId, resolvedSiteUrl, field?.AnchorId);
        }
        // No term set known for this field — show only taxonomy fields from the schema
        const taxFields = fields.filter(
          (f: FieldInfo) => f.TermSetId
        );
        if (taxFields.length === 0) {
          vscode.window.showErrorMessage('No taxonomy fields with term sets found in the Site Pages library');
          return null;
        }
        const picked = await vscode.window.showQuickPick<vscode.QuickPickItem & { id: string }>(
          taxFields.map((f: FieldInfo) => ({
            label: f.title || f.internalName,
            description: f.TermSetId,
            id: f.TermSetId!
          })),
          { placeHolder: 'Select a term set' }
        );
        if (!picked) { return null; }
        return termStoreService.getTerms(picked.id, resolvedSiteUrl);
      }
    );
  } catch (error: any) {
    console.error('[pickTerm] Failed to load terms:', error);
    vscode.window.showErrorMessage(`Doctor: failed to load terms — ${error?.message ?? error}`);
    return;
  }

  if (!terms) { return; }

  // Pick the best label: prefer en-US, fall back to first default, then first label
  const getLabel = (term: TermInfo): string => {
    const enLabel = term.labels.find((l) => l.languageTag === 'en-US' && l.isDefault);
    if (enLabel) { return enLabel.name; }
    const defaultLabel = term.labels.find((l) => l.isDefault);
    if (defaultLabel) { return defaultLabel.name; }
    return term.labels[0]?.name || term.id;
  };

  // Build quick-pick items with depth-based indentation prefix for visual
  // hierarchy (an em-dash per level, since VS Code trims leading spaces).
  const items = terms
    .filter((term) => !term.isDeprecated)
    .map((term) => {
      const depth = term.depth ?? 0;
      const name = getLabel(term);
      const prefix = '— '.repeat(depth);
      const label = `${prefix}${name}`;
      return {
        label,
        description: term.id,
        alwaysShow: true,
        term
      };
    });

  // Determine if this is a multi-value field. The schema TypeAsString may be
  // "Text" for taxonomy fields fetched via Graph (Graph doesn't expose the
  // taxonomy subtype), so also check the field title suffix as a fallback.
  const canPickMany = field
    ? isMultiField(field.TypeAsString)
    : false;

  const selected = await vscode.window.showQuickPick(items, {
    canPickMany,
    placeHolder: 'Select term(s)',
    matchOnDescription: true  // allows searching by term ID too
  });

  if (!selected) {
    return;
  }

  // Write value as { label, termGuid } object — single or array for multi-value
  const toValue = (t: TermInfo) => ({
    label: getLabel(t),
    termGuid: t.id
  });

  let value: any;
  if (Array.isArray(selected)) {
    value = selected.map((s) => toValue(s.term));
  } else {
    value = toValue((selected as any).term);
  }

  await updateField(targetDocument, fieldName, value, resolveFieldParentKey(targetDocument, fieldName, group));
}
