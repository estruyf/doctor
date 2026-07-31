import { readFile } from "fs/promises";
import { Listr } from "listr2";
import kleur from "kleur";
import matter from "gray-matter";
import { Authenticate } from "@commands";
import {
  FrontMatterHelper,
  MarkdownHelper,
  StateHelper,
} from "@helpers";
import { CommandArguments, PageFrontMatter, PublishContext } from "@models";
import { existsAsync } from "@utils";

interface StatusEntry {
  file: string;
  slug: string;
  state: "new" | "modified" | "unchanged" | "deleted";
}

export class Status {
  public static async start(options: CommandArguments) {
    if (!(await existsAsync(options.startFolder))) {
      return Promise.reject(
        new Error(`The provided folder location doesn't exist.`)
      );
    }

    if (!options.webUrl) {
      return Promise.reject(
        new Error(
          `In order to run the status command, you need to specify the '--url' property.`
        )
      );
    }

    const { startFolder, webUrl } = options;
    let statePageCount = 0;

    const ctx: PublishContext = { files: [] };
    const entries: StatusEntry[] = [];

    await Authenticate.init(options);

    await new Listr<PublishContext, "default", "verbose">(
      [
        {
          title: `Load publish state`,
          task: async (_, task) => {
            await StateHelper.load(webUrl, options.assetLibrary, options.stateFile);
            statePageCount = StateHelper.getPageCount();
            task.output = statePageCount > 0
              ? `${statePageCount} pages tracked in state`
              : `No state found — this may be the first publish`;
          },
          enabled: () => !options.disableStatePersistence,
          rendererOptions: { persistentOutput: true },
        },
        {
          title: `Fetch all markdown files`,
          task: async (c, task) => await MarkdownHelper.fetchMDFiles(c, task, startFolder),
          rendererOptions: { persistentOutput: true },
        },
        {
          title: `Compare with state`,
          task: async (c, task) => {
            const total = c.files.length;
            let processed = 0;

            for (const file of c.files) {
              if (!file.endsWith(".md")) continue;

              task.output = `[${++processed}/${total}] ${file}`;

              let contents: string;
              try {
                contents = await readFile(file, "utf-8");
              } catch {
                continue;
              }

              let slug: string;
              try {
                const markup = matter(contents);
                if (!markup.data?.title && !markup.data?.slug) continue;
                slug = FrontMatterHelper.getSlug(
                  markup.data as PageFrontMatter,
                  startFolder,
                  file,
                );
              } catch {
                continue;
              }

              const hash = StateHelper.hashContent(contents);
              const changed = StateHelper.hasChanged(slug, hash);

              if (statePageCount === 0) {
                entries.push({ file, slug, state: "new" });
              } else {
                entries.push({ file, slug, state: changed ? (StateHelper.isTracked(slug) ? "modified" : "new") : "unchanged" });
              }
            }

            // Detect pages in state that no longer exist locally
            const localSlugs = new Set(entries.map((e) => e.slug));
            for (const slug of StateHelper.getTrackedSlugs()) {
              if (!localSlugs.has(slug)) {
                entries.push({ file: "(not found locally)", slug, state: "deleted" });
              }
            }
          },
        },
      ],
      {
        renderer: "default",
        fallbackRenderer: "verbose",
        fallbackRendererCondition: options.debug || options.verbose,
      }
    ).run(ctx);

    // Print results
    const byState = (s: StatusEntry["state"]) => entries.filter((e) => e.state === s);
    const newPages = byState("new");
    const modified = byState("modified");
    const unchanged = byState("unchanged");
    const deleted = byState("deleted");

    console.log("");
    console.info(kleur.bold().bgYellow().black(` Status summary `));
    console.info(kleur.white(` State tracking: ${statePageCount} pages`));
    console.info(kleur.white(` Local files:    ${entries.length} checked`));
    console.log("");

    this.printGroup(kleur.green().bold(`  ✦ New (${newPages.length})`), newPages, "file");
    this.printGroup(kleur.yellow().bold(`  ✦ Modified (${modified.length})`), modified, "file");
    this.printGroup(kleur.red().bold(`  ✦ Deleted (${deleted.length})`), deleted, "slug");

    const unchangedLabel = options.verbose
      ? kleur.dim(`  ✦ Unchanged (${unchanged.length})`)
      : kleur.dim(`  ✦ Unchanged (${unchanged.length})  (pass --verbose to list)`);
    console.info(unchangedLabel);
    if (options.verbose && unchanged.length > 0) {
      for (const e of unchanged) {
        console.info(kleur.dim(`      ${e.file}`));
      }
    }

    console.log("");

    const totalChanged = newPages.length + modified.length;
    if (totalChanged === 0 && deleted.length === 0) {
      console.info(kleur.bold().bgGreen().black(` ✔ Everything up to date `));
    } else {
      console.info(
        kleur.bold().bgYellow().black(` ⚡ ${totalChanged} page${totalChanged !== 1 ? "s" : ""} will be published on next run `) +
        (deleted.length > 0 ? kleur.bold().bgRed().white(` ${deleted.length} deleted `) : "")
      );
    }
    console.log("");
  }

  private static printGroup(label: string, entries: StatusEntry[], key: "file" | "slug") {
    console.info(label);
    if (entries.length === 0) {
      console.info(kleur.dim(`      (none)`));
    } else {
      for (const e of entries) {
        console.info(`      ${e[key]}`);
      }
    }
    console.log("");
  }
}
