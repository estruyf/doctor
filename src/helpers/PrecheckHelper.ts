import { dirname, join } from "path";
import matter from "gray-matter";
import {
  CommandArguments,
  PageFrontMatter,
  PublishContext,
  TaskOutput,
} from "@models";
import { existsAsync, readFileAsync } from "@utils";
import { FrontMatterHelper } from "./FrontMatterHelper.js";

export class PrecheckHelper {
  public static async validate(
    ctx: PublishContext,
    task: TaskOutput,
    options: CommandArguments,
  ): Promise<void> {
    const files = ctx.files || [];
    const slugMap = new Map<string, string>();
    const issues: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      task.output = `Pre-checking [${i + 1}/${files.length}] ${filePath}`;

      const contents = await readFileAsync(filePath, { encoding: "utf-8" });
      if (!contents) {
        issues.push(`Unreadable file: ${filePath}`);
        continue;
      }

      let parsed: matter.GrayMatterFile<string>;
      try {
        parsed = matter(contents);
      } catch (error: any) {
        const message =
          typeof error === "string"
            ? error
            : error?.message || "Invalid front matter";
        issues.push(`Front matter parse failed: ${filePath} (${message})`);
        continue;
      }

      const data = (parsed.data || {}) as PageFrontMatter;

      if (data.type === "translation") {
        continue;
      }

      if (!data.title && !data.slug) {
        issues.push(
          `Missing page identity (title or slug required): ${filePath}`,
        );
        continue;
      }

      const resolvedSlug = FrontMatterHelper.getSlug(
        {
          ...data,
          title: data.title || data.slug || "",
        } as PageFrontMatter,
        options.startFolder,
        filePath,
      ).toLowerCase();

      const existing = slugMap.get(resolvedSlug);
      if (existing && existing !== filePath) {
        issues.push(
          `Duplicate target page slug "${resolvedSlug}" from:\n - ${existing}\n - ${filePath}`,
        );
      } else {
        slugMap.set(resolvedSlug, filePath);
      }

      if (data.localization) {
        const locales = Object.keys(data.localization);
        for (const locale of locales) {
          const localizedPath = data.localization[locale];
          if (!localizedPath) {
            continue;
          }

          const absoluteLocalizedPath = join(dirname(filePath), localizedPath);
          if (!(await existsAsync(absoluteLocalizedPath))) {
            issues.push(
              `Missing localization reference for locale "${locale}" in ${filePath}: ${absoluteLocalizedPath}`,
            );
          }
        }
      }
    }

    if (issues.length > 0) {
      const sample = issues.slice(0, 20).join("\n");
      const more =
        issues.length > 20
          ? `\n... and ${issues.length - 20} more pre-check issue(s).`
          : "";
      throw new Error(
        `Pre-check failed with ${issues.length} issue(s):\n${sample}${more}`,
      );
    }

    task.output = `Pre-check complete: ${files.length} file${files.length === 1 ? "" : "s"} validated, no collisions found`;
  }
}
