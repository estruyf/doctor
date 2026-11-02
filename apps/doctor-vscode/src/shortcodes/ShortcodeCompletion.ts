import * as path from 'path';
import * as vscode from 'vscode';
import { findDoctorJson } from '../utils/doctorContext';
import { isInsideFrontMatter } from '../utils/frontmatter';
import { ShortcodeInfo, ShortcodeRegistry } from './ShortcodeRegistry';

/** The open tag the cursor sits inside, if it is inside one */
interface OpenTag {
  tag: string;
  /** The attribute names already written on it, so they are not offered twice */
  written: string[];
}

/**
 * What the cursor is inside, read backwards from it.
 *
 * Only the text before the cursor on its own line matters: a shortcode tag is
 * written on one line, and anything after the cursor is not yet typed.
 */
export function openTagBefore(lineUpToCursor: string): OpenTag | null {
  const start = lineUpToCursor.lastIndexOf('<');
  if (start === -1) {
    return null;
  }

  const fragment = lineUpToCursor.slice(start);
  // A tag that was already closed is not one the cursor is inside
  if (fragment.includes('>')) {
    return null;
  }

  const name = /^<([A-Za-z][\w-]*)\s/.exec(fragment);
  if (!name) {
    return null;
  }

  return {
    tag: name[1],
    written: [...fragment.matchAll(/([A-Za-z_$][\w-]*)\s*=/g)].map((m) => m[1]),
  };
}

const documentationFor = (shortcode: ShortcodeInfo): vscode.MarkdownString => {
  const lines: string[] = [];

  if (shortcode.description) {
    lines.push(shortcode.description, '');
  }

  lines.push(
    shortcode.kind === 'webpart'
      ? '**Web part shortcode** — becomes a SharePoint web part of its own, splitting the page around it. It has to sit on a line of its own.'
      : '**Inline shortcode** — returns HTML inside the Markdown web part.'
  );

  if (shortcode.builtIn) {
    lines.push('', '_Built in to Doctor._');
  } else if (shortcode.file) {
    lines.push('', `_From \`${vscode.workspace.asRelativePath(shortcode.file)}\`_`);
  }

  return new vscode.MarkdownString(lines.join('\n'));
};

/**
 * Suggests the shortcodes a project has, and the attributes each one reads.
 *
 * Both come from reading the shortcodes folder rather than running it, so the
 * attribute list is as good as the source is readable — see `ShortcodeRegistry`.
 */
export class ShortcodeCompletionProvider implements vscode.CompletionItemProvider {
  public provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    // Front matter is YAML; a `<` there is not the start of a shortcode
    if (isInsideFrontMatter(document, position)) {
      return [];
    }

    const shortcodes = ShortcodeRegistry.get(findDoctorJson(path.dirname(document.uri.fsPath)));
    if (shortcodes.length === 0) {
      return [];
    }

    const lineUpToCursor = document
      .lineAt(position.line)
      .text.slice(0, position.character);

    const open = openTagBefore(lineUpToCursor);
    if (open) {
      return ShortcodeCompletionProvider.attributeItems(shortcodes, open);
    }

    if (!lineUpToCursor.endsWith('<')) {
      return [];
    }

    return shortcodes.map((shortcode) =>
      ShortcodeCompletionProvider.tagItem(shortcode, position)
    );
  }

  private static tagItem(
    shortcode: ShortcodeInfo,
    position: vscode.Position
  ): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      shortcode.tag,
      vscode.CompletionItemKind.Snippet
    );

    item.detail =
      shortcode.kind === 'webpart' ? 'Doctor web part shortcode' : 'Doctor shortcode';
    item.documentation = documentationFor(shortcode);
    // The `<` is already typed, so it is not part of what gets inserted
    item.range = new vscode.Range(position, position);
    item.insertText = new vscode.SnippetString(
      shortcode.paired
        ? `${shortcode.tag}$1>\n$0\n</${shortcode.tag}>`
        : `${shortcode.tag}$1 />`
    );
    // Doctor's own first, then the project's, each alphabetically
    item.sortText = `${shortcode.builtIn ? '0' : '1'}${shortcode.tag}`;

    return item;
  }

  private static attributeItems(
    shortcodes: ShortcodeInfo[],
    open: OpenTag
  ): vscode.CompletionItem[] {
    const shortcode = shortcodes.find((s) => s.tag === open.tag);
    if (!shortcode) {
      return [];
    }

    return shortcode.attributes
      .filter((attribute) => !open.written.includes(attribute.name))
      .map((attribute) => {
        const item = new vscode.CompletionItem(
          attribute.name,
          vscode.CompletionItemKind.Property
        );

        item.insertText = new vscode.SnippetString(`${attribute.name}="$1"`);
        item.detail =
          attribute.source === 'declared'
            ? `${shortcode.tag} attribute`
            : `${shortcode.tag} attribute (read from the shortcode's code)`;

        if (attribute.description) {
          item.documentation = new vscode.MarkdownString(attribute.description);
        } else if (attribute.source === 'inferred') {
          item.documentation = new vscode.MarkdownString(
            'Found by reading the shortcode rather than from a declaration, so it may be incomplete. Add an `attributes` array to the shortcode to list them exactly.'
          );
        }

        return item;
      });
  }
}

/** Shows what a shortcode is when hovering its tag */
export class ShortcodeHoverProvider implements vscode.HoverProvider {
  public provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | null {
    if (isInsideFrontMatter(document, position)) {
      return null;
    }

    const range = document.getWordRangeAtPosition(position, /<\/?([A-Za-z][\w-]*)/);
    if (!range) {
      return null;
    }

    const tag = document.getText(range).replace(/^<\/?/, '');
    const shortcode = ShortcodeRegistry.get(
      findDoctorJson(path.dirname(document.uri.fsPath))
    ).find((s) => s.tag === tag);

    if (!shortcode) {
      return null;
    }

    const documentation = documentationFor(shortcode);
    if (shortcode.attributes.length > 0) {
      documentation.appendMarkdown(
        `\n\n**Attributes:** ${shortcode.attributes.map((a) => `\`${a.name}\``).join(', ')}`
      );
    }

    return new vscode.Hover(documentation, range);
  }
}
