import * as path from "path";
import * as vscode from "vscode";
import { AuthService } from "./auth/AuthService";
import { CertificateAuthProvider } from "./auth/CertificateAuthProvider";
import { CertificatePasswordStore } from "./auth/CertificatePasswordStore";
import { setAuthMode } from "./auth/authMode";
import { registerConfigureCommand } from "./commands/configure";
import { registerLoginCommand, setOnLoginSuccess } from "./commands/login";
import { registerLogoutCommand } from "./commands/logout";
import { runPickTerm } from "./commands/pickTerm";
import { runPickUser } from "./commands/pickUser";
import { DOCTOR_RUNS, runDoctor } from "./commands/runDoctor";
import { GraphClient } from "./graph/GraphClient";
import { TermStoreService } from "./graph/TermStoreService";
import { UserService } from "./graph/UserService";
import { ConfigEditorProvider } from "./config/ConfigEditorProvider";
import { clearMenuIdCache, PanelProvider } from "./panel/PanelProvider";
import {
  ShortcodeCompletionProvider,
  ShortcodeHoverProvider,
} from "./shortcodes/ShortcodeCompletion";
import { ShortcodeRegistry } from "./shortcodes/ShortcodeRegistry";
import { ColumnSchemaService } from "./sharepoint/ColumnSchemaService";
import {
  type ResolvedDoctorCertificateAuth,
  resolveDoctorCertificateAuth,
} from "./utils/doctorConfig";
import { findDoctorJson, isInDoctorProject } from "./utils/doctorContext";

interface Services {
  termStoreService: TermStoreService;
  userService: UserService;
  columnSchemaService: ColumnSchemaService;
  siteUrl: string;
  getSharePointToken: (siteUrl: string) => Promise<string | null>;
}

// Populated after successful init; commands close over this reference.
let services: Services | null = null;
// The doctor.json path services were last initialized from, so we can detect
// when the active file moves to a different doctor project and reinit.
let initializedDoctorJsonPath: string | null = null;

export function activate(context: vscode.ExtensionContext) {
  console.log("doctor-metadata extension activated");

  // Register the side panel webview
  const panelProvider = PanelProvider.getInstance(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PanelProvider.viewType,
      panelProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      },
    ),
  );

  // Always register these so they are never "command not found".
  registerConfigureCommand(context);
  registerLoginCommand(context);
  setOnLoginSuccess(() => tryInitServices(context));
  registerLogoutCommand(context, {
    logout: async (tenantId: string) => {
      const cfg = vscode.workspace.getConfiguration("doctor-metadata");
      const clientId = cfg.get<string>("clientId");
      if (!clientId) {
        throw new Error("Missing configuration: doctor-metadata.clientId");
      }
      await new AuthService(clientId, tenantId, context).logout(tenantId);
    },
  } as AuthService);

  // Register pick/refresh commands that lazily use services set by tryInitServices.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "doctor-metadata.pickTerm",
      async (
        fieldName: string,
        termSetId: string,
        fileUri?: string,
        group?: "page" | "metadata",
      ) => {
        await tryInitServices(context);
        if (!services) {
          vscode.window.showWarningMessage(
            "Doctor Metadata is not ready. Check your doctor.json (or configure the fallback sign-in).",
          );
          return;
        }
        // Resolve the target document explicitly when invoked from the panel
        // (fileUri set) so a fast tab switch after clicking "pick" can't cause
        // the term to be written to whatever file happens to be active by the
        // time this command runs. Falls back to the active editor when invoked
        // from the command palette/CodeLens (no fileUri).
        const document = fileUri
          ? await vscode.workspace.openTextDocument(vscode.Uri.parse(fileUri))
          : vscode.window.activeTextEditor?.document;
        if (!document || !isInDoctorProject(document)) {
          vscode.window.showWarningMessage(
            "This file is not inside a doctor.json project.",
          );
          return;
        }
        try {
          await runPickTerm(
            fieldName,
            termSetId,
            services.termStoreService,
            services.columnSchemaService,
            document,
            group,
            services.siteUrl,
          );
        } catch (error: any) {
          console.error("doctor-metadata.pickTerm failed:", error);
          vscode.window.showErrorMessage(
            `Doctor Metadata: ${error?.message ?? error}`,
          );
        }
        PanelProvider.getInstance(context.extensionUri).refresh();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "doctor-metadata.pickUser",
      async (
        fieldName: string,
        fileUri?: string,
        group?: "page" | "metadata",
      ) => {
        await tryInitServices(context);
        if (!services) {
          vscode.window.showWarningMessage(
            "Doctor Metadata is not ready. Check your doctor.json (or configure the fallback sign-in).",
          );
          return;
        }
        const document = fileUri
          ? await vscode.workspace.openTextDocument(vscode.Uri.parse(fileUri))
          : vscode.window.activeTextEditor?.document;
        if (!document || !isInDoctorProject(document)) {
          vscode.window.showWarningMessage(
            "This file is not inside a doctor.json project.",
          );
          return;
        }
        try {
          await runPickUser(
            fieldName,
            services.userService,
            services.columnSchemaService,
            document,
            group,
            services.siteUrl,
          );
        } catch (error: any) {
          console.error("doctor-metadata.pickUser failed:", error);
          vscode.window.showErrorMessage(
            `Doctor Metadata: ${error?.message ?? error}`,
          );
        }
        PanelProvider.getInstance(context.extensionUri).refresh();
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("doctor-metadata.refreshSchema", async () => {
      if (!services) {
        vscode.window.showWarningMessage(
          "Doctor Metadata is not ready. Check your doctor.json (or configure the fallback sign-in).",
        );
        return;
      }
      await refreshAllData(services, context);
      vscode.window.showInformationMessage("Doctor Metadata: schema and term data refreshed");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "doctor-metadata.clearCertificatePassword",
      async () => {
        const doctorJsonPath = await discoverDoctorJsonPath();
        const certAuth = doctorJsonPath
          ? resolveDoctorCertificateAuth(doctorJsonPath)
          : null;
        if (!certAuth) {
          vscode.window.showWarningMessage(
            "No certificate authentication configured in doctor.json for the current project.",
          );
          return;
        }
        await new CertificatePasswordStore(context).delete(
          certificatePasswordStoreKey(certAuth),
        );
        vscode.window.showInformationMessage(
          "Stored certificate password cleared. You will be prompted for it again next time it is needed.",
        );
        await tryInitServices(context, true);
      },
    ),
  );

  // Reinitialize whenever the active editor moves to a (possibly different)
  // doctor project, and whenever doctor.json itself changes on disk.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      tryInitServices(context).catch((err) =>
        console.error("doctor-metadata init error:", err),
      );
    }),
  );

  // Run doctor itself: publish and status, from the palette, the side panel's
  // title bar and the doctor.json editor. Like the form and the completion,
  // these do not need the extension to be signed in — doctor signs in itself.
  for (const run of DOCTOR_RUNS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`doctor-metadata.${run.id}`, (uri?: vscode.Uri) =>
        runDoctor(context, run, uri instanceof vscode.Uri ? uri : undefined),
      ),
    );
  }

  // A form for doctor.json, opened in place of the text editor. Like the
  // shortcode completion, it reads files rather than SharePoint, so it does
  // not wait for sign-in.
  context.subscriptions.push(
    ...ConfigEditorProvider.register(context, async (doctorJsonPath, interactive) => {
      const sharePoint = await sharePointFor(context, doctorJsonPath, interactive);
      if (!sharePoint) {
        return null;
      }
      const client = new GraphClient(sharePoint.getToken);
      return client.getInstalledLanguages(sharePoint.siteUrl);
    }),
  );

  // Shortcode completion and hover in markdown. Both read the project's
  // shortcodes folder, so they work without being signed in — unlike the
  // metadata panel, which needs SharePoint.
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: "markdown" },
      new ShortcodeCompletionProvider(),
      // `<` opens the tag list, a space inside a tag opens the attribute list
      "<",
      " ",
    ),
    vscode.languages.registerHoverProvider(
      { language: "markdown" },
      new ShortcodeHoverProvider(),
    ),
  );

  // A shortcode is read from disk, so editing one has to invalidate what was
  // read. The registry caches for a few seconds; this is what makes a rename
  // or a new file show up at once.
  const shortcodeWatcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{js,cjs,mjs}",
  );
  const forgetShortcodes = () => ShortcodeRegistry.clear();
  shortcodeWatcher.onDidChange(forgetShortcodes);
  shortcodeWatcher.onDidCreate(forgetShortcodes);
  shortcodeWatcher.onDidDelete(forgetShortcodes);
  context.subscriptions.push(shortcodeWatcher);

  // Editing a page's `menu` block, or the static items in doctor.json, changes
  // the ids other pages can point at as their parent, so the collected list is
  // dropped when either is saved.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (
        document.languageId === "markdown" ||
        path.basename(document.uri.fsPath) === "doctor.json"
      ) {
        clearMenuIdCache();
      }
    }),
  );

  const doctorJsonWatcher =
    vscode.workspace.createFileSystemWatcher("**/doctor.json");
  const reinit = () =>
    tryInitServices(context, /* force */ true).catch((err) =>
      console.error("doctor-metadata init error:", err),
    );
  // doctor.json says where the shortcodes folder is, so it invalidates those too
  doctorJsonWatcher.onDidChange((uri) => {
    ShortcodeRegistry.clear();
    // It may name another site or certificate now
    editorSignIns.delete(uri.fsPath);
    reinit();
  });
  doctorJsonWatcher.onDidCreate(reinit);
  doctorJsonWatcher.onDidDelete(reinit);
  context.subscriptions.push(doctorJsonWatcher);

  // Reinitialize when relevant settings change (e.g. certificatePassword,
  // siteUrl/tenantId/clientId for the fallback path) so users don't need to
  // reload the window after fixing a config value.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("doctor-metadata")) {
        reinit();
      }
    }),
  );

  // Eagerly initialize if config is present (non-blocking).
  tryInitServices(context).catch((err) =>
    console.error("doctor-metadata init error:", err),
  );
}

/**
 * Finds the doctor.json that applies right now: the one nearest to the active
 * editor's file if there is one open, otherwise the first one found anywhere
 * in the workspace.
 */
async function discoverDoctorJsonPath(): Promise<string | null> {
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.uri.scheme === "file") {
    const nearest = findDoctorJson(path.dirname(editor.document.uri.fsPath));
    if (nearest) { return nearest; }
  }

  const found = await vscode.workspace.findFiles(
    "**/doctor.json",
    "**/{node_modules,dist,out,.git}/**",
    1,
  );
  return found.length > 0 ? found[0].fsPath : null;
}

/** Identifies a certificate config for secure password storage/retrieval purposes. */
function certificatePasswordStoreKey(
  certAuth: ResolvedDoctorCertificateAuth,
): string {
  return CertificatePasswordStore.idFor(certAuth.doctorJsonPath, certAuth.appId);
}

/** True when the error looks like node-forge's PKCS#12 "wrong/missing password" error. */
function isCertificatePasswordError(error: any): boolean {
  const message = error?.message ?? String(error ?? "");
  return (
    typeof message === "string" &&
    /invalid password|MAC could not be verified/i.test(message)
  );
}

/**
 * Creates the CertificateAuthProvider for a doctor.json certificate config,
 * transparently handling the case where the certificate is password-protected
 * but no password is committed to doctor.json (so it doesn't have to be
 * checked into source control): it prompts the user, stores the password
 * securely (VS Code SecretStorage, same mechanism as the interactive-auth
 * token cache), and re-prompts on each wrong attempt until either a working
 * password is entered or the user cancels the prompt.
 */
async function createCertificateAuthProvider(
  context: vscode.ExtensionContext,
  certAuth: ResolvedDoctorCertificateAuth,
): Promise<CertificateAuthProvider> {
  const passwordStore = new CertificatePasswordStore(context);
  const storeKey = certificatePasswordStoreKey(certAuth);

  // doctor.json's own "password" field, then the VS Code setting, take
  // precedence over anything previously saved interactively.
  const explicitPassword =
    certAuth.password ??
    vscode.workspace
      .getConfiguration("doctor-metadata")
      .get<string>("certificatePassword");

  const tryCreate = (password?: string) =>
    CertificateAuthProvider.create(
      certAuth.appId,
      certAuth.tenant,
      certAuth.certificatePath,
      certAuth.certificateBase64,
      password,
    );

  if (explicitPassword) {
    // A password was explicitly configured — use it as-is. If it's wrong,
    // surface that error normally rather than silently prompting for another
    // one behind the user's back.
    return tryCreate(explicitPassword);
  }

  const savedPassword = await passwordStore.get(storeKey);
  if (savedPassword) {
    try {
      return await tryCreate(savedPassword);
    } catch (error) {
      if (!isCertificatePasswordError(error)) { throw error; }
      // Saved password no longer works (e.g. cert was rotated) — forget it
      // and fall through to prompting for a new one below.
      await passwordStore.delete(storeKey);
    }
  }

  // Keep prompting until the user provides a working password or cancels
  // (presses Escape / leaves the box empty), in which case we give up.
  let promptMessage = `The certificate for "${certAuth.appId}" is password-protected. Enter the password to continue (it will be stored securely, not in doctor.json).`;
  for (;;) {
    const password = await vscode.window.showInputBox({
      title: "Certificate password required",
      prompt: promptMessage,
      password: true,
      ignoreFocusOut: true,
    });

    if (!password) {
      throw new Error(
        'The certificate is password-protected and no password was provided. Set "password" in doctor.json, or reload and enter it when prompted.',
      );
    }

    try {
      const provider = await tryCreate(password);
      await passwordStore.set(storeKey, password);
      return provider;
    } catch (error) {
      if (!isCertificatePasswordError(error)) { throw error; }
      promptMessage = `That password didn't work for the certificate for "${certAuth.appId}". Try again, or leave empty to cancel.`;
    }
  }
}


/** Sign-ins the doctor.json editor made itself, per doctor.json */
const editorSignIns = new Map<string, (siteUrl: string) => Promise<string | null>>();

/**
 * A SharePoint token getter for a particular doctor.json, for the config
 * editor's language list.
 *
 * The panel signs in for the project of the last markdown file it showed,
 * which need not be the doctor.json open in the form — and a custom editor is
 * not an active text editor, so opening one does not move the panel along.
 * So: reuse the panel's sign-in when it is for this file; otherwise sign in
 * for this file, but only when asked to, because signing in can mean asking
 * for the certificate password, and nobody expects that from scrolling to a
 * field.
 */
async function sharePointFor(
  context: vscode.ExtensionContext,
  doctorJsonPath: string,
  interactive: boolean,
): Promise<{ siteUrl: string; getToken: (siteUrl: string) => Promise<string | null> } | null> {
  const certAuth = resolveDoctorCertificateAuth(doctorJsonPath);
  if (!certAuth) {
    return null;
  }

  if (services && initializedDoctorJsonPath === doctorJsonPath) {
    return { siteUrl: certAuth.siteUrl, getToken: services.getSharePointToken };
  }

  const existing = editorSignIns.get(doctorJsonPath);
  if (existing) {
    return { siteUrl: certAuth.siteUrl, getToken: existing };
  }

  if (!interactive) {
    return null;
  }

  const provider = await createCertificateAuthProvider(context, certAuth);
  const getToken = (spSiteUrl: string) => provider.getSharePointToken(spSiteUrl);
  editorSignIns.set(doctorJsonPath, getToken);
  return { siteUrl: certAuth.siteUrl, getToken };
}

async function tryInitServices(
  context: vscode.ExtensionContext,
  force = false,
) {
  const doctorJsonPath = await discoverDoctorJsonPath();

  // Nothing changed since last (successful) init — skip re-creating services.
  if (!force && services && doctorJsonPath === initializedDoctorJsonPath) {
    return;
  }

  let siteUrl: string;
  let getSharePointToken: (siteUrl: string) => Promise<string | null>;

  if (doctorJsonPath) {
    const certAuth = resolveDoctorCertificateAuth(doctorJsonPath);

    if (certAuth) {
      // Primary auth path: certificate auth configured via doctor.json.
      try {
        const certProvider = await createCertificateAuthProvider(
          context,
          certAuth,
        );
        setAuthMode("certificate");
        siteUrl = certAuth.siteUrl;
        getSharePointToken = (spSiteUrl: string) =>
          certProvider.getSharePointToken(spSiteUrl);
      } catch (error) {
        const message = `Certificate authentication configured in "${doctorJsonPath}" failed to initialize: ${error}`;
        vscode.window.showErrorMessage(`Doctor Metadata: ${message}`);
        console.error("Certificate auth init error:", error);
        services = null;
        PanelProvider.getInstance(context.extensionUri).setServicesError(
          message,
        );
        return;
      }
    } else {
      // doctor.json exists but is missing appId/tenant/certificate/url — fall back.
      vscode.window.showWarningMessage(
        `Doctor Metadata: found "${doctorJsonPath}" but it is missing appId/tenant/certificate/url for certificate authentication. Falling back to interactive sign-in.`,
      );
      const fallback = await initInteractiveFallback(context);
      if (!fallback) {
        services = null;
        PanelProvider.getInstance(context.extensionUri).setServicesError(
          `"${doctorJsonPath}" is missing appId/tenant/certificate/url for certificate authentication, and the fallback sign-in isn't configured either.`,
        );
        return;
      }
      siteUrl = fallback.siteUrl;
      getSharePointToken = fallback.getSharePointToken;
    }
  } else {
    // No doctor.json anywhere — fall back to the legacy interactive path entirely.
    const fallback = await initInteractiveFallback(context);
    if (!fallback) {
      services = null;
      PanelProvider.getInstance(context.extensionUri).setServicesError(
        "No doctor.json was found, and the fallback sign-in (siteUrl/tenantId/clientId) is not configured.",
      );
      return;
    }
    siteUrl = fallback.siteUrl;
    getSharePointToken = fallback.getSharePointToken;
  }

  try {
    const graphClient = new GraphClient(getSharePointToken);
    const termStoreService = new TermStoreService(graphClient, context);
    const userService = new UserService(graphClient);
    const columnSchemaService = new ColumnSchemaService(graphClient, context);

    services = {
      termStoreService,
      userService,
      columnSchemaService,
      siteUrl,
      getSharePointToken,
    };
    initializedDoctorJsonPath = doctorJsonPath;

    // Push services into the panel so it can load field data
    PanelProvider.getInstance(context.extensionUri).setServices(
      columnSchemaService,
      siteUrl,
    );

    // The persisted schema/term caches can be (and usually are) still warm
    // from a previous session, so the panel above already renders instantly
    // from them. But cached data can silently go stale between sessions
    // (columns/terms changed server-side), so always kick off one silent,
    // non-blocking revalidation per (re)init — "refetch on startup" — rather
    // than waiting for the cache's own TTL to expire.
    refreshAllData(services, context).catch((error) =>
      console.error("doctor-metadata startup refresh error:", error),
    );
  } catch (error) {
    const message = `Failed to initialize Doctor Metadata: ${error}`;
    vscode.window.showErrorMessage(message);
    console.error("Extension init error:", error);
    services = null;
    PanelProvider.getInstance(context.extensionUri).setServicesError(message);
  }
}

/**
 * Force-revalidates the column schema and every term set referenced by its
 * taxonomy fields, bypassing the in-memory/persisted cache's TTL entirely.
 * Used both for the silent startup refresh (see tryInitServices) and for the
 * user-triggered "Doctor: Refresh Column Schema" command/panel button —
 * either way, the panel keeps showing whatever cached data it already has
 * (marked as syncing) until this resolves, so it never blanks out.
 */
async function refreshAllData(
  currentServices: Services,
  context: vscode.ExtensionContext,
): Promise<void> {
  const panelProvider = PanelProvider.getInstance(context.extensionUri);
  panelProvider.setSyncing(true);
  try {
    const fields = await currentServices.columnSchemaService.getColumnSchema(
      currentServices.siteUrl,
      { forceRefresh: true },
    );

    // Only term sets actually referenced by a taxonomy field are worth
    // eagerly refreshing here — this doesn't attempt to enumerate every term
    // set in the term store, only the ones this project's schema uses.
    const termSets = new Map<string, string | undefined>();
    for (const field of fields) {
      if (field.TermSetId) {
        termSets.set(field.TermSetId, field.AnchorId);
      }
    }

    await Promise.all(
      Array.from(termSets.entries()).map(([termSetId, anchorId]) =>
        currentServices.termStoreService
          .getTerms(termSetId, currentServices.siteUrl, anchorId, { forceRefresh: true })
          .catch((error) =>
            console.error(`doctor-metadata: failed to refresh term set "${termSetId}":`, error),
          ),
      ),
    );
  } catch (error) {
    console.error("doctor-metadata: failed to refresh column schema:", error);
    throw error;
  } finally {
    panelProvider.setSyncing(false);
  }
}

/**
 * FALLBACK AUTH PATH — used only when no doctor.json with complete certificate
 * settings can be found. Reads the legacy doctor-metadata.* VS Code settings and
 * uses interactive (device code) sign-in. See AuthService for details.
 */
async function initInteractiveFallback(
  context: vscode.ExtensionContext,
): Promise<{
  siteUrl: string;
  getSharePointToken: (siteUrl: string) => Promise<string | null>;
} | null> {
  const cfg = vscode.workspace.getConfiguration("doctor-metadata");
  const clientId = cfg.get<string>("clientId");
  const tenantId = cfg.get<string>("tenantId");
  const siteUrl = cfg.get<string>("siteUrl");

  if (!clientId || !tenantId || !siteUrl) {
    setAuthMode("unconfigured");
    vscode.window.showWarningMessage(
      'Doctor Metadata is not configured: no doctor.json with certificate auth was found, and the fallback sign-in settings (siteUrl/tenantId/clientId) are incomplete. Run "Doctor: Configure Fallback Sign-in" to get started.',
    );
    return null;
  }

  setAuthMode("interactive");
  const authService = new AuthService(clientId, tenantId, context);
  return {
    siteUrl,
    getSharePointToken: (spSiteUrl: string) =>
      authService.getSharePointToken(spSiteUrl),
  };
}

export function deactivate() {
  console.log("doctor-metadata extension deactivated");
}
