import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Walk up the directory tree from `startDir` looking for a `doctor.json` file.
 * Returns the path to the doctor.json if found, or null otherwise.
 */
export function findDoctorJson(startDir: string): string | null {
  let dir = startDir;
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, 'doctor.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Returns true if the given document is inside a project that has a doctor.json.
 */
export function isInDoctorProject(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== 'file') { return false; }
  const dir = path.dirname(document.uri.fsPath);
  return findDoctorJson(dir) !== null;
}

/**
 * Returns true if the active text editor is a markdown file inside a doctor project.
 */
export function activeEditorIsInDoctorProject(): boolean {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return false; }
  if (editor.document.languageId !== 'markdown') { return false; }
  return isInDoctorProject(editor.document);
}
