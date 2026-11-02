import { randomBytes } from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { DOCTOR_RUNS, DoctorRun, runDoctor } from '../commands/runDoctor';
import schema from './doctor-schema.json';
import { builtInLanguages, Language, readInstalledLanguages } from './languages';
import { dialogStartFor, PATH_FIELDS, valueForPickedPath } from './pathFields';
import {
  buildGroups,
  detectStyle,
  FieldDescriptor,
  getAt,
  isRevealable,
  parse,
  SchemaNode,
  serialise,
  setAt,
} from './configModel';

/** host → webview */
export interface ConfigStateMessage {
  command: 'state';
  groups: ReturnType<typeof buildGroups>;
  /** Every value except the credentials, keyed by dotted path */
  values: Record<string, unknown>;
  /** Which credentials have a value, without the value itself */
  secretsSet: Record<string, boolean>;
  /** A credential whose value is safe to show — a path to a certificate file */
  revealed: Record<string, string>;
  /** The settings that hold a path on disk, which get a Browse button */
  pathFields: string[];
  error?: string;
}

/** host → webview: the languages `multilingual.languages` can be set to */
export interface LanguagesMessage {
  command: 'languages';
  /** Where the list came from — the site itself, or doctor's built-in table */
  source: 'sharepoint' | 'builtin';
  languages: Language[];
  /** Why SharePoint was not asked, or what went wrong when it was */
  note?: string;
}

/**
 * Asks SharePoint for a doctor.json's languages. Returns null when there is no
 * sign-in to ask with and `interactive` says not to make one.
 */
export type LanguageSource = (doctorJsonPath: string, interactive: boolean) => Promise<any | null>;

/** webview → host */
export type ConfigEditorMessage =
  | { command: 'ready' }
  | { command: 'loadLanguages'; interactive: boolean }
  | { command: 'pickPath'; path: string }
  | { command: 'set'; path: string; value: unknown }
  | { command: 'openSource' }
  | { command: 'run'; run: DoctorRun['id'] };

const VIEW_TYPE = 'doctor-metadata.configEditor';

const flatten = (fields: FieldDescriptor[]): FieldDescriptor[] =>
  fields.flatMap((f) => (f.children ? [f, ...flatten(f.children)] : [f]));

/**
 * A form for doctor.json, opened in place of the text editor.
 *
 * Built the way vscode-demo-time builds its act editor: a custom *text*
 * editor, so the file stays an ordinary text document. Undo, the dirty dot,
 * save, Git and the JSON schema validation in the text view all keep working,
 * because every change the form makes is a normal edit to that document.
 */
export class ConfigEditorProvider implements vscode.CustomTextEditorProvider {
  private readonly groups = buildGroups(schema as SchemaNode);
  private readonly fields = flatten(this.groups.flatMap((g) => g.fields));

  public static register(
    context: vscode.ExtensionContext,
    languages: LanguageSource
  ): vscode.Disposable[] {
    return [
      vscode.window.registerCustomEditorProvider(VIEW_TYPE, new ConfigEditorProvider(context, languages), {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }),
      vscode.commands.registerCommand('doctor-metadata.openConfigAsText', (uri?: vscode.Uri) =>
        vscode.commands.executeCommand(
          'vscode.openWith',
          uri ?? vscode.window.activeTextEditor?.document.uri,
          'default'
        )
      ),
      vscode.commands.registerCommand('doctor-metadata.openConfigEditor', (uri?: vscode.Uri) =>
        vscode.commands.executeCommand(
          'vscode.openWith',
          uri ?? vscode.window.activeTextEditor?.document.uri,
          VIEW_TYPE
        )
      ),
    ];
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly languages: LanguageSource
  ) {}

  /**
   * The language list for the form.
   *
   * SharePoint's own when it can be asked, because that is what the site can
   * actually be switched to; doctor's built-in table otherwise, so the field
   * still works offline or before signing in. The note says which, so the form
   * can offer to load the real one.
   */
  private async languagesFor(document: vscode.TextDocument, interactive: boolean): Promise<LanguagesMessage> {
    const fallback = (note: string): LanguagesMessage => ({
      command: 'languages',
      source: 'builtin',
      languages: builtInLanguages(vscode.env.language),
      note,
    });

    try {
      const body = await this.languages(document.uri.fsPath, interactive);
      if (body === null) {
        return fallback('Built-in list. Load the languages from SharePoint to see exactly what this site offers.');
      }

      const languages = readInstalledLanguages(body);
      if (languages.length === 0) {
        return fallback('SharePoint returned no languages, so this is the built-in list.');
      }

      return { command: 'languages', source: 'sharepoint', languages };
    } catch (e: unknown) {
      return fallback(
        `SharePoint could not be asked (${e instanceof Error ? e.message : String(e)}), so this is the built-in list.`
      );
    }
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    panel: vscode.WebviewPanel
  ): Promise<void> {
    const useForm = vscode.workspace
      .getConfiguration('doctor-metadata')
      .get<boolean>('openConfigInEditor', true);

    if (!useForm) {
      // Opted out: hand the file to the ordinary text editor instead
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
      return;
    }

    panel.webview.options = { enableScripts: true };
    panel.webview.html = this.html(panel.webview);

    const post = () => panel.webview.postMessage(this.state(document));

    // Whatever changes the document — typing in the text view, a Git
    // checkout, the form itself — flows back into the form
    const changes = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() === document.uri.toString() && e.contentChanges.length > 0) {
        post();
      }
    });
    panel.onDidDispose(() => changes.dispose());

    panel.webview.onDidReceiveMessage(async (message: ConfigEditorMessage) => {
      switch (message.command) {
        case 'ready':
          post();
          break;
        case 'set':
          await this.apply(document, message.path, message.value);
          break;
        case 'loadLanguages':
          panel.webview.postMessage(await this.languagesFor(document, message.interactive));
          break;
        case 'pickPath':
          await this.pickPath(document, message.path);
          break;
        case 'openSource':
          await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
          break;
        case 'run': {
          // Only the commands the extension defines; the message names one
          const run = DOCTOR_RUNS.find((r) => r.id === message.run);
          if (run) {
            await runDoctor(this.context, run, document.uri);
          }
          break;
        }
      }
    });
  }

  /**
   * What the form is told.
   *
   * The credentials are reported as set or not, never sent. `certificate` can
   * be the base64 of a private key, and there is no reason for it to live in a
   * webview's DOM when the form only needs to say whether one is configured.
   */
  private state(document: vscode.TextDocument): ConfigStateMessage {
    const parsed = parse(document.getText());
    const config = parsed.ok ? parsed.config : {};

    const values: Record<string, unknown> = {};
    const secretsSet: Record<string, boolean> = {};
    const revealed: Record<string, string> = {};

    for (const field of this.fields) {
      const value = getAt(config, field.path);
      if (field.kind === 'secret') {
        secretsSet[field.path] = typeof value === 'string' && value.length > 0;
        if (isRevealable(field.key, value)) {
          revealed[field.path] = value;
        }
      } else if (field.kind !== 'object') {
        values[field.path] = value;
      }
    }

    return {
      command: 'state',
      groups: this.groups,
      values,
      secretsSet,
      revealed,
      pathFields: Object.keys(PATH_FIELDS),
      ...(parsed.ok ? {} : { error: parsed.error }),
    };
  }

  /**
   * Apply one change from the form to the document as it is *now*.
   *
   * The form sends a path and a value, not a whole config, so an edit made in
   * the text view a moment earlier is not overwritten by a stale copy, and
   * keys the schema does not know about are never at risk.
   */
  private async apply(document: vscode.TextDocument, path: string, value: unknown): Promise<void> {
    if (!this.fields.some((f) => f.path === path)) {
      // Only paths the schema describes; a webview message is not trusted to
      // name any key it likes
      return;
    }

    const text = document.getText();
    const parsed = parse(text);
    if (!parsed.ok) {
      // Never write over a file the form could not read — it is somebody's
      // half-finished edit, and the form would replace it with an object
      void vscode.window.showWarningMessage(
        'doctor.json is not valid JSON, so the form cannot save this change. Fix it in the text editor first.'
      );
      return;
    }

    const next = serialise(setAt(parsed.config, path, value), detectStyle(text));
    if (next === text) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(0), document.positionAt(text.length)),
      next
    );
    await vscode.workspace.applyEdit(edit);
  }

  /**
   * Browse for a setting's file or folder and write it the way doctor will read
   * it back — which depends on the setting, see `PATH_FIELDS`.
   */
  private async pickPath(document: vscode.TextDocument, settingPath: string): Promise<void> {
    const rule = PATH_FIELDS[settingPath];
    if (!rule) {
      return;
    }

    const parsed = parse(document.getText());
    const config = parsed.ok ? parsed.config : {};
    const projectFolder = path.dirname(document.uri.fsPath);
    const resolveIn = (value: unknown, fallback: string) =>
      path.resolve(projectFolder, typeof value === 'string' && value ? value : fallback);

    const context = {
      projectFolder,
      contentFolder: resolveIn(getAt(config, 'folder'), './src'),
      partialsFolder: resolveIn(getAt(config, 'partials.folder'), './partials'),
    };

    const picked = await vscode.window.showOpenDialog({
      title: rule.title,
      defaultUri: vscode.Uri.file(dialogStartFor(rule, getAt(config, settingPath), context)),
      canSelectFiles: rule.pick === 'file',
      canSelectFolders: rule.pick === 'folder',
      canSelectMany: false,
      openLabel: 'Use this',
      ...(rule.extensions ? { filters: { [rule.title]: rule.extensions } } : {}),
    });

    if (!picked || picked.length === 0) {
      return;
    }

    const result = valueForPickedPath(rule, picked[0].fsPath, context);
    if ('error' in result) {
      void vscode.window.showWarningMessage(result.error);
      return;
    }

    await this.apply(document, settingPath, result.value);
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'config-editor.js')
    );
    const nonce = randomBytes(16).toString('base64');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>doctor.json</title>
  <style>
    body { margin: 0; padding: 0; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    button, input, select, textarea { font-family: inherit; font-size: inherit; }
    input:focus, select:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
  }
}
