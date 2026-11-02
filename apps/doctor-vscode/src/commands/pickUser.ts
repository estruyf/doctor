import * as vscode from 'vscode';
import { UserService } from '../graph/UserService';
import { updateField, resolveFieldParentKey, getFieldValue } from '../utils/frontmatter';
import { isMultiField } from '../utils/fieldTypes';
import { FieldInfo, SiteUserInfo } from '../types';
import { DOCTOR_FIELD_MAPPINGS } from '../utils/doctorMappings';

/**
 * Custom Person/Group fields store a UPN string (not a raw site-user ID —
 * that's only `author`/AuthorId, see `valueKind: 'siteUserId'`). Site users
 * are looked up via SharePoint REST (`_api/web/siteusers`), which returns a
 * claims-encoded LoginName (e.g. `i:0#.f|membership|user@tenant.com`) rather
 * than a bare UPN, so it has to be extracted from there — falling back to
 * Email if the LoginName doesn't look like the standard membership-claim
 * shape (e.g. some external/guest accounts).
 */
function upnFromSiteUser(user: SiteUserInfo): string {
  const afterLastPipe = user.loginName?.includes('|') ? user.loginName.slice(user.loginName.lastIndexOf('|') + 1) : user.loginName;
  if (afterLastPipe && afterLastPipe.includes('@')) {
    return afterLastPipe;
  }
  return user.email || afterLastPipe || user.loginName;
}

export async function runPickUser(
  fieldName: string,
  userService: UserService,
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
    siteUrl || vscode.workspace.getConfiguration('doctor-metadata').get<string>('siteUrl');
  if (!resolvedSiteUrl) {
    vscode.window.showErrorMessage('Site URL not configured');
    return;
  }

  // Doctor-mapped fields (Section 1, e.g. `author`) are keyed by their front
  // matter key, which doesn't always match the SharePoint field's internal
  // name (e.g. `author` vs `Author`). Resolve the mapping up front so we can
  // both branch on value kind and use the *correct* schema name below.
  const mapping = DOCTOR_FIELD_MAPPINGS.find((m) => m.frontMatterKey === fieldName);

  if (mapping?.valueKind === 'siteUserId') {
    await pickSiteUser(fieldName, resolvedSiteUrl, userService, targetDocument, group);
    return;
  }

  let field: FieldInfo | undefined;
  try {
    const fields = await schemaService.getColumnSchema(resolvedSiteUrl);
    const schemaFieldName = mapping?.spInternalName ?? fieldName;
    field = fields.find((f: FieldInfo) => f.internalName === schemaFieldName);
  } catch (error: any) {
    console.error('[pickUser] Failed to load schema:', error);
    vscode.window.showErrorMessage(`Doctor Metadata: failed to load field schema — ${error?.message ?? error}`);
    return;
  }

  if (!field) {
    vscode.window.showErrorMessage('Field not found in schema');
    return;
  }

  const canPickMany = isMultiField(field.TypeAsString);
  const parentKey = resolveFieldParentKey(targetDocument, fieldName, group);

  const quickPick = vscode.window.createQuickPick();
  quickPick.canSelectMany = canPickMany;
  quickPick.placeholder = 'Search for users...';
  quickPick.busy = false;

  // Track picks by UPN across searches — QuickPick.items gets replaced
  // wholesale on every keystroke, which would otherwise silently drop
  // previously checked users (and any pre-existing value) from the final
  // selection the moment they scroll out of the current search results.
  const pickedByUpn = new Map<string, { label: string; description?: string; user: any }>();

  if (canPickMany) {
    const existing = getFieldValue(targetDocument, fieldName, parentKey);
    const existingUpns: string[] = Array.isArray(existing)
      ? existing.filter((v) => typeof v === 'string')
      : typeof existing === 'string' && existing
      ? [existing]
      : [];
    for (const upn of existingUpns) {
      // Display name isn't known yet — it's filled in below if/when a search
      // result happens to match, otherwise the UPN itself is shown.
      pickedByUpn.set(upn.toLowerCase(), { label: upn, description: 'Already selected', user: { userPrincipalName: upn } });
    }
    if (pickedByUpn.size > 0) {
      quickPick.items = Array.from(pickedByUpn.values()).map((entry) => ({ ...entry, picked: true })) as any;
      quickPick.selectedItems = quickPick.items;
    }
  }

  let searchTimeout: NodeJS.Timeout;
  let lastSearchErrorShown: string | null = null;
  // Guards onDidChangeSelection against wiping out picks when items are
  // temporarily replaced by the error placeholder (which has no `.user` and
  // is never selected), so a transient search failure can't un-pick anyone.
  let itemsAreErrorPlaceholder = false;
  quickPick.onDidChangeValue(async (query) => {
    clearTimeout(searchTimeout);
    quickPick.busy = true;

    searchTimeout = setTimeout(async () => {
      try {
        const siteUsers = await userService.searchSiteUsers(resolvedSiteUrl, query);
        const users = siteUsers.map((u) => ({
          id: u.id,
          displayName: u.displayName,
          userPrincipalName: upnFromSiteUser(u)
        }));
        // Update already-picked entries with the real display name once we
        // learn it, and merge in fresh results — but keep every previously
        // picked user in the list (checked) even if this search doesn't
        // return them, so switching queries can never silently un-pick them.
        for (const user of users) {
          const key = (user.userPrincipalName || '').toLowerCase();
          if (pickedByUpn.has(key)) {
            pickedByUpn.set(key, { label: user.displayName, description: user.userPrincipalName, user });
          }
        }
        const resultUpns = new Set(users.map((u) => (u.userPrincipalName || '').toLowerCase()));
        const stillPickedElsewhere = Array.from(pickedByUpn.entries())
          .filter(([key]) => !resultUpns.has(key))
          .map(([, entry]) => entry);

        const items = [
          ...stillPickedElsewhere.map((entry) => ({ ...entry, picked: true })),
          ...users.map((user) => {
            const key = (user.userPrincipalName || '').toLowerCase();
            return {
              label: user.displayName,
              description: user.userPrincipalName,
              user,
              picked: pickedByUpn.has(key)
            };
          })
        ];
        itemsAreErrorPlaceholder = false;
        quickPick.items = items as any;
        quickPick.selectedItems = items.filter((i) => i.picked) as any;
        quickPick.busy = false;
      } catch (error: any) {
        console.error('[pickUser] Search error:', error);
        quickPick.busy = false;
        const message = error?.message ?? String(error);
        // Show the failure inline in the list (so it's visible even if the
        // quick pick isn't focused) as well as a toast, but avoid repeating
        // the same toast on every keystroke while the user keeps typing.
        itemsAreErrorPlaceholder = true;
        quickPick.items = [
          { label: '$(error) User search failed', description: message, alwaysShow: true } as any
        ];
        if (lastSearchErrorShown !== message) {
          lastSearchErrorShown = message;
          vscode.window.showErrorMessage(`Doctor Metadata: user search failed — ${message}`);
        }
      }
    }, 300);
  });

  // The selection-change event reflects the *entire* current check state
  // across quickPick.items (not just the ones from the latest search), so
  // it's the single source of truth for what's picked — replace our map
  // wholesale on every change rather than trying to diff it. Skip this while
  // the error placeholder is showing, since its (empty) selection would
  // otherwise wipe out every previously picked user.
  quickPick.onDidChangeSelection((selected) => {
    if (!canPickMany || itemsAreErrorPlaceholder) { return; }
    pickedByUpn.clear();
    for (const item of selected as any[]) {
      if (!item.user) { continue; }
      const key = (item.user.userPrincipalName || '').toLowerCase();
      pickedByUpn.set(key, { label: item.label, description: item.description, user: item.user });
    }
  });

  let acceptedSingle: any;
  quickPick.onDidAccept(() => {
    if (!canPickMany) {
      // Filter out the inline error placeholder item (no `.user`) so
      // accepting it can never crash or write a bogus value.
      const [first] = (quickPick.selectedItems as any[]).filter((item) => item.user);
      acceptedSingle = first?.user;
    }
    quickPick.hide();
  });

  quickPick.show();

  await new Promise((resolve) => {
    quickPick.onDidHide(() => resolve(null));
  });

  if (canPickMany) {
    const selectedUsers = Array.from(pickedByUpn.values());
    if (selectedUsers.length === 0) {
      return;
    }
    const value = selectedUsers.map((s) => s.user.userPrincipalName);
    await updateField(targetDocument, fieldName, value, parentKey);
    return;
  }

  if (!acceptedSingle) {
    return;
  }

  await updateField(targetDocument, fieldName, acceptedSingle.userPrincipalName, parentKey);
}

/**
 * Picker for fields whose value is a raw SharePoint site user ID (integer),
 * e.g. the reserved Author column. Searches the site's own User Information
 * List via SharePoint REST rather than tenant-wide Graph /users, since only
 * users known to that specific site have an ID there, and always writes a
 * single integer — never a UPN, never an array.
 */
async function pickSiteUser(
  fieldName: string,
  siteUrl: string,
  userService: UserService,
  document: vscode.TextDocument,
  group?: 'page' | 'metadata'
): Promise<void> {
  const quickPick = vscode.window.createQuickPick();
  quickPick.placeholder = 'Search for a site user (must be a member of / have visited this site)...';
  quickPick.busy = false;

  let searchTimeout: NodeJS.Timeout;
  let lastSearchErrorShown: string | null = null;
  quickPick.onDidChangeValue((query) => {
    clearTimeout(searchTimeout);
    quickPick.busy = true;

    searchTimeout = setTimeout(async () => {
      try {
        const users = await userService.searchSiteUsers(siteUrl, query);
        quickPick.items = users.map((user) => ({
          label: user.displayName,
          // The address they sign in with, the way the multi-value picker
          // shows it. Preferring Email put a profile value people do not
          // recognise in front of them, and falling back to the raw
          // LoginName showed the `i:0#.f|membership|` claim itself.
          description: upnFromSiteUser(user),
          detail: `Site user ID: ${user.id}`,
          user
        })) as any;
        quickPick.busy = false;
      } catch (error: any) {
        console.error('[pickUser] Site user search error:', error);
        quickPick.busy = false;
        const message = error?.message ?? String(error);
        quickPick.items = [
          { label: '$(error) User search failed', description: message, alwaysShow: true } as any
        ];
        if (lastSearchErrorShown !== message) {
          lastSearchErrorShown = message;
          vscode.window.showErrorMessage(`Doctor Metadata: user search failed — ${message}`);
        }
      }
    }, 300);
  });

  let selectedUser: any;
  quickPick.onDidAccept(() => {
    const [first] = (quickPick.selectedItems as any[]).filter((item) => item.user);
    selectedUser = first?.user;
    quickPick.hide();
  });

  quickPick.show();

  await new Promise((resolve) => {
    quickPick.onDidHide(() => resolve(null));
  });

  if (!selectedUser) {
    return;
  }

  await updateField(document, fieldName, selectedUser.id, resolveFieldParentKey(document, fieldName, group));
}
