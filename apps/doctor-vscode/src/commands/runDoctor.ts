import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CertificatePasswordStore } from '../auth/CertificatePasswordStore';
import { resolveDoctorCertificateAuth } from '../utils/doctorConfig';
import { findDoctorJson } from '../utils/doctorContext';

/**
 * The environment variable doctor reads the certificate password from. It has
 * to match `CERTIFICATE_PASSWORD_ENV` in doctor's OptionsHelper — one of the
 * copies listed in doctor's restructure plan. Read by doctor 2.3.0 and later;
 * an older doctor ignores it and asks for the password itself.
 */
export const CERTIFICATE_PASSWORD_ENV = 'DOCTOR_CERTIFICATE_PASSWORD';

/**
 * Which certificate password, if any, the extension should hand doctor.
 *
 * The same order the panel signs in with: doctor.json's own `password`, then
 * the `certificatePassword` setting, then the one the extension stored after
 * asking. The first needs no help — doctor reads doctor.json itself — so only
 * the other two are handed over. Without one, doctor asks for it in the task
 * terminal, as it does on the command line.
 *
 * Pure, so the order can be tested without a VS Code.
 */
export function passwordToHandOver(sources: {
  inDoctorJson?: string;
  setting?: string;
  stored?: string;
}): string | undefined {
  if (sources.inDoctorJson) {
    return undefined;
  }
  return sources.setting || sources.stored || undefined;
}

/**
 * The environment a doctor run starts with: the certificate password, when
 * there is one doctor would not otherwise find.
 *
 * In the environment and nowhere else. On the command line it would be
 * printed by the task terminal and sit in the process list for the whole run,
 * readable by every user on the machine; the environment of a process is only
 * readable by its own user, and a task does not echo it.
 */
async function environmentFor(
  context: vscode.ExtensionContext,
  doctorJson: string
): Promise<Record<string, string> | undefined> {
  const auth = resolveDoctorCertificateAuth(doctorJson);
  if (!auth) {
    // Not a certificate setup doctor can sign in with; nothing to hand over
    return undefined;
  }

  const password = passwordToHandOver({
    inDoctorJson: auth.password,
    setting: vscode.workspace.getConfiguration('doctor-metadata').get<string>('certificatePassword'),
    stored: await new CertificatePasswordStore(context).get(
      CertificatePasswordStore.idFor(auth.doctorJsonPath, auth.appId)
    ),
  });

  return password ? { [CERTIFICATE_PASSWORD_ENV]: password } : undefined;
}

/** A doctor command the extension knows how to start */
export interface DoctorRun {
  id: 'publish' | 'publishAll' | 'status';
  title: string;
  args: string[];
}

export const DOCTOR_RUNS: DoctorRun[] = [
  { id: 'publish', title: 'Publish', args: ['publish'] },
  { id: 'publishAll', title: 'Publish all pages', args: ['publish', '--forceAll'] },
  { id: 'status', title: 'Show status', args: ['status'] },
];

/**
 * The doctor executable for a project.
 *
 * In order: the `doctor-metadata.doctorCommand` setting when it has been set;
 * a `doctor` the project installed itself, so a pinned version is the one
 * that runs; otherwise the global `doctor` the docs tell people to install.
 *
 * Deliberately never `npx doctor`. Without a local install npx resolves the
 * bare name against the npm registry, and `doctor` there is an unrelated
 * package — so it would download and run somebody else's code.
 *
 * Exported for testing; `exists` stands in for the filesystem.
 */
export function resolveDoctorExecutable(
  projectFolder: string,
  configured: string | undefined,
  exists: (file: string) => boolean = fs.existsSync,
  platform: NodeJS.Platform = process.platform
): string {
  if (configured && configured.trim()) {
    return configured.trim();
  }

  const local = path.join(
    projectFolder,
    'node_modules',
    '.bin',
    platform === 'win32' ? 'doctor.cmd' : 'doctor'
  );
  if (exists(local)) {
    return local;
  }

  return 'doctor';
}

/**
 * Which project a command is for: the one the active file belongs to, or the
 * one the user picks when nothing open says.
 */
async function pickDoctorJson(uri?: vscode.Uri): Promise<string | undefined> {
  const from = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (from?.scheme === 'file') {
    const found = findDoctorJson(path.dirname(from.fsPath));
    if (found) {
      return found;
    }
  }

  const all = await vscode.workspace.findFiles('**/doctor.json', '**/node_modules/**', 50);
  if (all.length === 0) {
    void vscode.window.showWarningMessage(
      'No doctor.json found in this workspace. Doctor runs from the folder that holds one.'
    );
    return undefined;
  }

  if (all.length === 1) {
    return all[0].fsPath;
  }

  const choice = await vscode.window.showQuickPick(
    all.map((file) => ({ label: vscode.workspace.asRelativePath(file), file })),
    { placeHolder: 'Which doctor project?' }
  );
  return choice?.file.fsPath;
}

/**
 * Start a doctor command for a project.
 *
 * Run as a task rather than by typing into a terminal: a ShellExecution
 * quotes the executable and its arguments correctly for whichever shell the
 * user has, where `sendText` would leave a path with a space in it to break.
 * The task terminal still takes input, so doctor can ask for a certificate
 * password the way it does on the command line.
 *
 * It starts in the folder that holds doctor.json, because that is where doctor
 * looks for it — `process.cwd()`, not the workspace root.
 */
export async function runDoctor(
  context: vscode.ExtensionContext,
  run: DoctorRun,
  uri?: vscode.Uri
): Promise<void> {
  const doctorJson = await pickDoctorJson(uri);
  if (!doctorJson) {
    return;
  }

  const projectFolder = path.dirname(doctorJson);
  const executable = resolveDoctorExecutable(
    projectFolder,
    vscode.workspace.getConfiguration('doctor-metadata').get<string>('doctorCommand')
  );

  // A file being edited would publish as it was last saved, which is not what
  // somebody pressing Publish while looking at it expects
  if (run.args[0] === 'publish') {
    const dirty = vscode.workspace.textDocuments.filter(
      (d) => d.isDirty && d.uri.fsPath.startsWith(projectFolder + path.sep)
    );
    if (dirty.length > 0) {
      const choice = await vscode.window.showWarningMessage(
        `${dirty.length} file${dirty.length === 1 ? ' has' : 's have'} unsaved changes, which would not be published.`,
        { modal: true },
        'Save all and publish',
        'Publish anyway'
      );
      if (!choice) {
        return;
      }
      if (choice === 'Save all and publish') {
        await vscode.workspace.saveAll(false);
      }
    }
  }

  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectFolder));
  const name = `doctor ${run.args.join(' ')}`;
  const env = await environmentFor(context, doctorJson);

  const task = new vscode.Task(
    // The definition is what the tasks UI shows and offers to re-run, so the
    // password stays out of it — it travels only in the execution's env
    { type: 'shell', doctorRun: run.id, project: doctorJson },
    folder ?? vscode.TaskScope.Workspace,
    name,
    'Doctor',
    new vscode.ShellExecution(executable, run.args, {
      cwd: projectFolder,
      // Merged with the extension host's own environment, not a replacement
      ...(env ? { env } : {}),
    })
  );

  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
    focus: false,
  };

  await vscode.tasks.executeTask(task);
}
