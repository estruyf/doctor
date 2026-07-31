import { CheerioAPI, load } from "cheerio";
import { Element } from "domhandler";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import {
  CommandArguments,
  PublishContext,
  PublishOutput,
  TaskOutput,
  Control,
  PageFrontMatter,
} from "@models";
import {
  FileHelpers,
  FolderHelpers,
  FrontMatterHelper,
  HeaderHelper,
  Logger,
  MultilingualHelper,
  NavigationHelper,
  PagesHelper,
  StateHelper,
  StatusHelper,
} from "@helpers";
import { basename, join, dirname } from "path";
import { existsAsync, mkdirAsync, readFileAsync, writeFileAsync } from "@utils";

export class DoctorTranspiler {
  private static converter = new MarkdownIt({ html: true, breaks: true });

  /**
   * Process the retrieved Markdown files
   * @param ctx
   * @param task
   * @param options
   * @param output
   */
  public static async processMDFiles(
    ctx: PublishContext,
    task: TaskOutput,
    options: CommandArguments,
    output: PublishOutput,
  ): Promise<void> {
    const { webUrl } = options;

    Logger.debug("Starting processing the markdown files...");
    Logger.debug(`Web URL: ${webUrl}`);

    const { files } = ctx;
    const total = files.length;

    Logger.debug(`Number of markdown files found: ${total}`);

    await PagesHelper.getAllPages(webUrl);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filename = basename(file);
      task.output = `[${i + 1}/${total}] ${filename}`;

      Logger.debug(`Processing file: ${file}`);

      try {
        await this.processFile(file, task, options, output);
      } catch (e) {
        StatusHelper.addError();
        Logger.debug(e.message);

        if (!options.continueOnError) {
          throw new Error(e.message);
        }
      }
    }
  }

  /**
   * Process page
   * @param file
   * @param task
   * @param converter
   * @param options
   * @param output
   * @param languagePage
   */
  public static async processFile(
    file: string,
    task: TaskOutput,
    options: CommandArguments,
    output: PublishOutput,
    languagePageSlug: string | null = null,
  ) {
    const { webUrl, webPartTitle, skipExistingPages, disableComments } =
      options;

    if (file.endsWith(".md")) {
      const filename = basename(file);

      let contents = await readFileAsync(file, { encoding: "utf-8" });
      if (contents) {
        // Compute hash once — used for change detection and state recording
        const contentHash = options.skipUnchanged
          ? StateHelper.hashContent(contents)
          : null;

        const markup: matter.GrayMatterFile<string> = matter(contents);

        // Don't process language files, these will be processed later in the process
        if (
          !languagePageSlug &&
          markup.data &&
          markup.data.type === "translation"
        ) {
          return;
        }

        const htmlMarkup = file.endsWith(`.machinetranslated.md`)
          ? contents
          : this.converter.render(contents);

        const $ = load(htmlMarkup, {
          xml: {
            xmlMode: true,
            decodeEntities: false,
          },
        });
        const imgElms = $(`img`).toArray();
        const anchorElms = $(`a`).toArray();

        // Check if the required data for the article is present
        if (markup && !markup.data) {
          throw new Error(`The "${filename}" has no front matter defined`);
        } else if (markup && markup.data) {
          if (!markup.data.title) {
            throw new Error(`The "${filename}" has no 'title' defined`);
          }
        }

        let { title, description, draft, layout, header, template, metadata } =
          markup.data as PageFrontMatter;
        let slug =
          languagePageSlug ||
          FrontMatterHelper.getSlug(
            markup.data as PageFrontMatter,
            options.startFolder,
            file,
          );

        // Change detection: skip unchanged files when --skipUnchanged is set
        if (options.skipUnchanged && contentHash && !languagePageSlug) {
          if (!StateHelper.hasChanged(slug, contentHash)) {
            task.output = `Skipped (unchanged): ${filename}`;
            Logger.debug(`Skipping unchanged file: ${filename}`);
            StatusHelper.addPageSkipped();
            return;
          }
        }

        // Check if comments are disabled on global level, or overwrite it from page level
        const disablePageComments =
          typeof markup.data.comments !== "undefined"
            ? !markup.data.comments
            : disableComments;
        Logger.debug(
          `Page comments ${disablePageComments ? "disabled" : "enabled"}`,
        );

        // Image processing
        if (imgElms && imgElms.length > 0) {
          task.output = `Uploading ${imgElms.length} image${imgElms.length === 1 ? "" : "s"} from ${filename}`;

          markup.content = await this.processImages(
            $,
            imgElms,
            file,
            markup.content,
            options,
            output,
            task,
          );
        }

        // Anchor processing
        if (anchorElms && anchorElms.length > 0) {
          task.output = `Processing ${anchorElms.length} link${anchorElms.length === 1 ? "" : "s"} in ${filename}`;

          Logger.debug(`Number of links in ${filename}: ${anchorElms.length}`);

          try {
            markup.content = await this.processLinks(
              $,
              anchorElms,
              file,
              markup.content,
              options,
            );
          } catch (e) {
            throw new Error(e.message);
          }
        }

        // Checks if output needs to be generated
        if (options.outputFolder) {
          const { outputFolder, startFolder } = options;
          const processedFilePath = file.replace(
            startFolder,
            join(process.cwd(), outputFolder),
          );
          const dirPath = dirname(processedFilePath);
          await mkdirAsync(dirPath, { recursive: true });
          await writeFileAsync(processedFilePath, markup.content, {
            encoding: "utf-8",
          });
        }

        if (markup && markup.content) {
          task.output = `Checking if page exists: ${slug}`;

          // Check if the page already exists
          const existed = await PagesHelper.createPageIfNotExists(
            webUrl,
            slug,
            title,
            layout,
            disablePageComments,
            description,
            template || options.pageTemplate,
            skipExistingPages && !languagePageSlug,
          );

          Logger.debug(
            `Page existed: ${existed} - Skipping existing pages: ${skipExistingPages}`,
          );

          if (
            !existed ||
            (existed && !skipExistingPages) ||
            (existed && languagePageSlug)
          ) {
            task.output = existed
              ? `Updating existing page: ${title}`
              : `Creating new page: ${title}`;

            // Retrieving all the controls from the page, so that we can start replacing the
            const controlData: string = await PagesHelper.getPageControls(
              webUrl,
              slug,
            );
            if (controlData) {
              const webparts: Control[] = JSON.parse(controlData);
              const markdownWp: Control | undefined = webparts.find(
                (c: Control) =>
                  c.webPartData && c.webPartData.title === webPartTitle,
              );
              await PagesHelper.insertOrCreateControl(
                webPartTitle,
                markup.content,
                slug,
                webUrl,
                options,
                markdownWp ? markdownWp.id : undefined,
                options.markdown ?? null,
                file.endsWith(`.machinetranslated.md`),
              );
            }

            // Apply the page header after the page has content, because the CLI header command
            // fails on pages with uninitialized CanvasContent1/LayoutWebpartsContent.
            await HeaderHelper.set(
              file,
              webUrl,
              slug,
              header,
              options,
              !!(template || options.pageTemplate),
            );

            // Check if metadata needs to be added to the page
            if (metadata) {
              task.output = `Setting metadata for ${filename}`;
              await PagesHelper.setPageMetadata(webUrl, slug, metadata);
            }

            // Check if page needs to be published
            if (typeof draft === "undefined" || !draft) {
              task.output = `Publishing page: ${title}`;
              await PagesHelper.publishPageIfNeeded(webUrl, slug);
            }

            // Set the page its description
            if (description) {
              task.output = `Setting page description for ${filename}`;
              await PagesHelper.setPageDescription(webUrl, slug, description);
            }

            if (existed) {
              StatusHelper.addPageUpdated();
            } else {
              StatusHelper.addPageCreated();
            }

            // Record hash so next run can skip unchanged files
            if (options.skipUnchanged && contentHash) {
              StateHelper.markPublished(slug, contentHash);
            }
          } else {
            task.output = `Skipped (already exists): ${filename}`;
            Logger.debug(`Skipping "${filename}" as it already exists`);
            StatusHelper.addPageSkipped();
          }
        }

        // Check if the file contains a menu element to add too and if not in draft status (cannot add draft pages to navigation)
        if (
          output.navigation &&
          markup &&
          markup.data &&
          markup.data.menu &&
          !markup.data.draft
        ) {
          Logger.debug(
            `Adding item to the navigation: ${slug} - ${title} - ${JSON.stringify(
              markup.data.menu,
            )} `,
          );

          output.navigation = NavigationHelper.hierarchy(
            webUrl,
            output.navigation,
            markup.data.menu,
            slug,
            title,
          );
        }

        // Verify if there are linked multilingual pages
        if (
          !languagePageSlug &&
          options.multilingual &&
          options.multilingual.enableTranslations &&
          markup &&
          markup.data &&
          markup.data.localization
        ) {
          await MultilingualHelper.linkPage(
            markup.data.localization,
            file,
            slug,
            options,
            task,
            output,
          );
        }
      }
    }
  }

  /**
   * Process images referenced in the file
   * @param $
   * @param imgElms
   * @param filePath
   * @param contents
   * @param options
   * @param output
   * @param task
   */
  private static async processImages(
    $: CheerioAPI,
    imgElms: Element[],
    filePath: string,
    contents: string,
    options: CommandArguments,
    output: PublishOutput,
    task: TaskOutput,
  ) {
    const { startFolder, assetLibrary, webUrl, overwriteImages } = options;

    const imgSources = imgElms
      .filter((i) => !!$(i).attr("src") && !$(i).attr("src")!.startsWith(`http`))
      .map((img) => $(img).attr("src")!);
    const uImgSources = [...new Set(imgSources)];
    const total = uImgSources.length;

    for (let idx = 0; idx < uImgSources.length; idx++) {
      const imgSource = uImgSources[idx];
      Logger.debug(`Adding image: ${imgSource} - ${imgSources.length}`);

      task.output = `Uploading image [${idx + 1}/${total}]: ${imgSource}`;

      const imgDirectory = join(dirname(filePath), dirname(imgSource));
      const imgPath = join(dirname(filePath), imgSource);

      const uniStartPath = startFolder.replace(/\\/g, "/");
      const folders = imgDirectory
        .replace(/\\/g, "/")
        .replace(uniStartPath, "")
        .split("/");
      let crntFolder = assetLibrary;

      // Start folder creation process
      crntFolder = await FolderHelpers.create(crntFolder, folders, webUrl);

      try {
        const imgUrl = await FileHelpers.create(
          crntFolder,
          imgPath,
          webUrl,
          overwriteImages,
        );
        contents = contents.replace(new RegExp(imgSource, "g"), imgUrl);
        StatusHelper.addImage();
      } catch (e) {
        return Promise.reject(
          new Error(
            `Something failed while uploading the image asset. ${e.message}`,
          ),
        );
      }
    }

    return contents;
  }

  /**
   * Process the links referenced in the markdown files
   * @param $
   * @param linkElms
   * @param filePath
   * @param content
   * @param options
   */
  private static async processLinks(
    $: CheerioAPI,
    linkElms: Element[],
    filePath: string,
    content: string,
    options: CommandArguments,
  ): Promise<string> {
    const { webUrl, startFolder } = options;

    const fLinks = linkElms.filter(
      (i) => !!$(i).attr("href") && !$(i).attr("href")!.startsWith(`http`),
    );
    const uLinks = [...new Set(fLinks)];

    for (const link of uLinks) {
      const $link = $(link);
      const fileLink = $link.attr("href");
      if (!fileLink) continue;
      let mdFile = "";

      Logger.debug(`Processing link: ${fileLink} for ${filePath}`);

      if (fileLink.endsWith(`.md`)) {
        mdFile = fileLink;
      } else if (fileLink === ".") {
        mdFile = basename(filePath);
      } else {
        mdFile = `${fileLink}.md`;
      }

      const mdFilePath = join(dirname(filePath), mdFile);

      Logger.debug(`File path for link: ${mdFilePath}`);

      if (await existsAsync(mdFilePath)) {
        // Get the contents of the file
        const mdContents = await readFileAsync(mdFilePath, {
          encoding: "utf-8",
        });
        if (!mdContents) {
          continue;
        }

        // Get the slug
        const mdData = matter(mdContents);
        if (!mdData || !mdData.data) {
          continue;
        }

        const slug = FrontMatterHelper.getSlug(
          mdData.data as PageFrontMatter,
          startFolder,
          mdFilePath,
        );
        const spUrl = `${webUrl}${
          webUrl.endsWith("/") ? "" : "/"
        }sitepages/${slug}`;
        Logger.debug(`Referenced file slug: ${spUrl}`);

        // Update the link in the markdown
        content = content.replace(`(${fileLink})`, `(${spUrl})`);
        content = content.replace(`"${fileLink}"`, `"${spUrl}"`);
        content = content.replace(`'${fileLink}`, `'${spUrl}'`);
      } else {
        Logger.debug(`Referenced file not found`);
      }
    }

    return content;
  }
}
