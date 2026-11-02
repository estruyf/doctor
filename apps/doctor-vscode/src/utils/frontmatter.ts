import * as vscode from "vscode";
import matter from "gray-matter";
import { DOCTOR_FIELD_MAPPINGS } from "./doctorMappings";

export interface FrontMatterData {
  data: Record<string, any>;
  range: vscode.Range;
  content: string;
}

export function parseFrontMatter(
  document: vscode.TextDocument,
): FrontMatterData {
  const text = document.getText();
  const parsed = matter(text);

  let endLine = 0;
  if (text.startsWith("---")) {
    const lines = text.split("\n");
    let inFrontMatter = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        if (!inFrontMatter) {
          inFrontMatter = true;
        } else {
          endLine = i + 1;
          break;
        }
      }
    }
  }

  return {
    data: parsed.data,
    range: new vscode.Range(0, 0, endLine, 0),
    content: parsed.content,
  };
}

export function isInsideFrontMatter(
  document: vscode.TextDocument,
  position: vscode.Position,
): boolean {
  const text = document.getText();
  if (!text.startsWith("---")) { return false; }

  let currentLine = 0;
  let inFrontMatter = false;

  for (const line of text.split("\n")) {
    if (currentLine === position.line) { return inFrontMatter; }
    if (line.trim() === "---") {
      if (!inFrontMatter) {
        inFrontMatter = true;
      } else {
        break;
      }
    }
    currentLine++;
  }

  return inFrontMatter;
}

export function isInsideMetadataBlock(
  document: vscode.TextDocument,
  position: vscode.Position,
): boolean {
  if (!isInsideFrontMatter(document, position)) { return false; }

  const line = document.lineAt(position.line).text;
  if (line.trim().startsWith("metadata:")) { return true; }

  if (line.match(/^\s+/)) {
    for (let i = position.line - 1; i >= 0; i--) {
      const prevLine = document.lineAt(i).text;
      if (prevLine.trim().startsWith("metadata:")) { return true; }
      if (prevLine.trim() && !prevLine.match(/^\s+/)) { return false; }
    }
  }

  return false;
}

export function getFieldNameAtLine(
  document: vscode.TextDocument,
  lineNumber: number,
): string | null {
  const line = document.lineAt(lineNumber).text;
  const match = line.match(/^\s*(\w+)\s*:/);
  return match ? match[1] : null;
}

/**
 * Resolves whether `fieldName` should be written at the front matter root or
 * nested under `metadata:`. Prefers an explicit group (known for sure when
 * invoked from the panel, which tracks each field's section), and falls back
 * to inspecting the document's current front matter for commands invoked
 * without that context (e.g. the command palette or CodeLens, which only
 * know the field name) — an existing `metadata.<fieldName>` key means it
 * belongs there, otherwise it's treated as a root-level field.
 */
export function resolveFieldParentKey(
  document: vscode.TextDocument,
  fieldName: string,
  group?: "page" | "metadata",
): string | undefined {
  if (group === "metadata") { return "metadata"; }
  if (group === "page") { return undefined; }

  const { data } = parseFrontMatter(document);
  const metadata = data.metadata;
  if (metadata && typeof metadata === "object" && fieldName in metadata) {
    return "metadata";
  }
  return undefined;
}

/**
 * Reads a field's current value from front matter without mutating anything.
 * Used to pre-populate pickers (e.g. so a multi-user picker shows already
 * selected users as checked, instead of only ever replacing the whole value).
 */
export function getFieldValue(
  document: vscode.TextDocument,
  fieldName: string,
  parentKey?: string,
): any {
  const { data } = parseFrontMatter(document);
  if (parentKey) {
    return data[parentKey]?.[fieldName];
  }
  return data[fieldName];
}

/**
 * Update a single field using gray-matter for a proper round-trip.
 * Parses the front matter, mutates the data object, then uses matter.stringify
 * to write a clean front matter block back, replacing the full document.
 */
// Canonical key order for doctor's hardcoded front matter keys — kept in
// sync with DOCTOR_FIELD_MAPPINGS' own declaration order, so writes always
// group these together (and in a stable, predictable order) rather than
// wherever plain object key-insertion order happens to place them (which,
// for a newly-added key, is always at the very end).
const DOCTOR_KEY_ORDER = DOCTOR_FIELD_MAPPINGS.map((m) => m.frontMatterKey);

/**
 * Reorders a front matter data object's top-level keys so every doctor
 * default field (DOCTOR_FIELD_MAPPINGS) that's present comes first, in
 * DOCTOR_KEY_ORDER, followed by every other key (custom fields, the
 * `metadata` block, etc.) in their original relative order. Applied on
 * every write — not just when adding a brand-new key — so it's
 * self-healing for files that already have the wrong order (e.g. from
 * manual edits, or from before this ordering existed).
 */
function reorderTopLevelKeys(data: Record<string, any>): Record<string, any> {
  const ordered: Record<string, any> = {};
  for (const key of DOCTOR_KEY_ORDER) {
    if (key in data) {
      ordered[key] = data[key];
    }
  }
  for (const key of Object.keys(data)) {
    if (!(key in ordered)) {
      ordered[key] = data[key];
    }
  }
  return ordered;
}

export async function updateField(
  document: vscode.TextDocument,
  fieldName: string,
  value: any,
  parentKey?: string,
): Promise<boolean> {
  const text = document.getText();
  const parsed = matter(text);

  const data: Record<string, any> = JSON.parse(JSON.stringify(parsed.data));

  if (parentKey) {
    if (
      !data[parentKey] ||
      typeof data[parentKey] !== "object" ||
      Array.isArray(data[parentKey])
    ) {
      data[parentKey] = {};
    }
    if (value === null || value === undefined || value === "") {
      delete data[parentKey][fieldName];
    } else {
      data[parentKey][fieldName] = value;
    }
  } else {
    if (value === null || value === undefined || value === "") {
      delete data[fieldName];
    } else {
      data[fieldName] = value;
    }
  }

  const orderedData = reorderTopLevelKeys(data);

  // matter.stringify(content, data) produces "---\n<yaml>\n---\n<content>"
  // If a previous bad write left a stray front matter block at the start of
  // parsed.content, strip it so we don't end up with two --- blocks.
  let content = parsed.content;
  if (/^\s*---[\s\S]*?---/.test(content)) {
    content = content.replace(/^\s*---[\s\S]*?---\s*/, "");
  }

  const newText = matter.stringify(content, orderedData, {
    // gray-matter passes extra opts through to js-yaml, whose types don't
    // declare lineWidth — the `as any` cast below covers the mismatch.
    lineWidth: -1,
  } as any);

  const fullRange = new vscode.Range(
    new vscode.Position(0, 0),
    document.lineAt(document.lineCount - 1).range.end,
  );

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, fullRange, newText);
  return vscode.workspace.applyEdit(edit);
}
