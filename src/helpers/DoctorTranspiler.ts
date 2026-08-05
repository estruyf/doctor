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
  PartialsHelper,
  StateHelper,
  StatusHelper,
} from "@helpers";
import { basename, join, dirname } from "path";
import {
  existsAsync,
  mkdirAsync,
  readFileAsync,
  relativePath,
  writeFileAsync,
} from "@utils";

const getErrorMessage = (error: unknown): string => {
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
};

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
    Logger.debug(`Number of markdown files found: ${files.length}`);

    await PagesHelper.getAllPages(webUrl);

    let filesToProcess = files;
    if (!options.forceAll) {
      const plan = await this.buildProcessingPlan(files, options, output);
      filesToProcess = plan.filesToProcess;
      StatusHelper.addPagesSkipped(plan.skippedUnchanged);
      task.output = `Processing ${filesToProcess.length} changed/new page${filesToProcess.length === 1 ? "" : "s"} (${plan.skippedUnchanged} unchanged skipped)`;
    }

    const total = filesToProcess.length;
    if (total === 0) {
      task.output = "No changed/new pages to process";
      return;
    }

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const relPath = relativePath(file);
      const pageStart = Date.now();
      task.output = `[${i + 1}/${total}] Processing ${relPath}`;

      Logger.debug(`Processing file: ${relPath}`);

      try {
        await this.processFile(file, task, options, output, null, i + 1, total);
      } catch (e) {
        StatusHelper.addError(file);
        // Prefix with the file so the failure is traceable when many pages
        // share the same file name (e.g. index.md in every folder).
        const errorMessage = `${relPath}: ${getErrorMessage(e)}`;
        Logger.debug(errorMessage);

        if (!options.continueOnError) {
          throw new Error(errorMessage);
        }
      } finally {
        StatusHelper.addPageDuration(file, Date.now() - pageStart);
      }
    }
  }

  private static async buildProcessingPlan(
    files: string[],
    options: CommandArguments,
    output: PublishOutput,
  ): Promise<{ filesToProcess: string[]; skippedUnchanged: number }> {
    const filesToProcess: string[] = [];
    let skippedUnchanged = 0;

    for (const file of files) {
      if (!file.endsWith(".md")) {
        continue;
      }

      const contents = await readFileAsync(file, { encoding: "utf-8" });
      if (!contents) {
        filesToProcess.push(file);
        continue;
      }

      try {
        const markup = matter(contents);

        // Translation pages are handled from source pages when multilingual linking runs.
        if (markup.data && markup.data.type === "translation") {
          continue;
        }

        if (!markup.data || !markup.data.title) {
          filesToProcess.push(file);
          continue;
        }

        const slug = FrontMatterHelper.getSlug(
          markup.data as PageFrontMatter,
          options.startFolder,
          file,
        );
        // Partials are part of the page, so a changed partial has to mark every
        // page using it as changed
        const { hash: contentHash } = await PartialsHelper.process(
          file,
          contents,
          options,
        );

        if (StateHelper.hasChanged(slug, contentHash)) {
          filesToProcess.push(file);
        } else {
          skippedUnchanged++;

          // The navigation is rebuilt from scratch on every publish, so unchanged
          // pages still need to contribute their menu entry. Without this, skipped
          // pages would silently disappear from the site navigation.
          this.addToNavigation(
            options.webUrl,
            output,
            markup.data as PageFrontMatter,
            slug,
            markup.data.title,
          );
        }
      } catch {
        // Keep error handling behavior in processFile by letting it process this file normally.
        filesToProcess.push(file);
      }
    }

    return { filesToProcess, skippedUnchanged };
  }

  /**
   * Merges the page its menu definition into the navigation structure that gets
   * applied after all pages have been processed. Draft pages are ignored, as
   * they cannot be added to the site navigation.
   * @param webUrl
   * @param output
   * @param data The front matter of the page
   * @param slug
   * @param title
   */
  private static addToNavigation(
    webUrl: string,
    output: PublishOutput,
    data: PageFrontMatter | undefined,
    slug: string,
    title: string,
  ) {
    if (!output.navigation || !data || !data.menu || data.draft) {
      return;
    }

    Logger.debug(
      `Adding item to the navigation: ${slug} - ${title} - ${JSON.stringify(
        data.menu,
      )} `,
    );

    output.navigation = NavigationHelper.hierarchy(
      webUrl,
      output.navigation,
      data.menu,
      slug,
      title,
    );
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
    currentIndex: number = 0,
    totalFiles: number = 0,
  ) {
    const { webUrl, webPartTitle, skipExistingPages, disableComments } =
      options;
    const progressPrefix =
      currentIndex > 0 && totalFiles > 0 ? `[${currentIndex}/${totalFiles}] ` : "";
    const setProgress = (message: string) => {
      task.output = `${progressPrefix}${message}`;
    };

    if (file.endsWith(".md")) {
      const relPath = relativePath(file);

      let contents = await readFileAsync(file, { encoding: "utf-8" });
      if (contents) {
        const markup: matter.GrayMatterFile<string> = matter(contents);

        // Don't process language files, these will be processed later in the process
        if (
          !languagePageSlug &&
          markup.data &&
          markup.data.type === "translation"
        ) {
          return;
        }

        // Machine translated pages are generated from a source page which had
        // its partials injected already, so they are taken as-is.
        const isMachineTranslated = file.endsWith(`.machinetranslated.md`);

        // Inject the partials before the images and links get processed, so the
        // assets and references they bring along are handled like page content.
        // The hash is computed once — used for change detection and state recording
        const { content, hash: contentHash } = isMachineTranslated
          ? { content: markup.content, hash: StateHelper.hashContent(contents) }
          : await PartialsHelper.process(file, contents, options);
        markup.content = content;

        const htmlMarkup = isMachineTranslated
          ? contents
          : this.converter.render(markup.content);

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
          throw new Error(`The "${relPath}" has no front matter defined`);
        } else if (markup && markup.data) {
          if (!markup.data.title) {
            throw new Error(`The "${relPath}" has no 'title' defined`);
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

        // Change detection: skip unchanged files unless --forceAll is set
        if (!options.forceAll && !languagePageSlug) {
          if (!StateHelper.hasChanged(slug, contentHash)) {
            setProgress(`Skipped (unchanged): ${relPath}`);
            Logger.debug(`Skipping unchanged file: ${relPath}`);
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
          setProgress(
            `Uploading ${imgElms.length} image${imgElms.length === 1 ? "" : "s"} from ${relPath}`,
          );

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
          setProgress(
            `Processing ${anchorElms.length} link${anchorElms.length === 1 ? "" : "s"} in ${relPath}`,
          );

          Logger.debug(`Number of links in ${relPath}: ${anchorElms.length}`);

          try {
            markup.content = await this.processLinks(
              $,
              anchorElms,
              file,
              markup.content,
              options,
            );
          } catch (e: any) {
            const message =
              typeof e === "string" ? e : e?.message || JSON.stringify(e);
            throw new Error(`Failed while processing links in ${relPath}. ${message}`);
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
          setProgress(`Checking if page exists: ${slug}`);

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
            setProgress(
              existed
              ? `Updating existing page: ${title}`
              : `Creating new page: ${title}`,
            );

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
              setProgress(`Setting metadata for ${relPath}`);
              await PagesHelper.setPageMetadata(webUrl, slug, metadata);
            }

            // Check if page needs to be published
            if (typeof draft === "undefined" || !draft) {
              setProgress(`Publishing page: ${title}`);
              await PagesHelper.publishPageIfNeeded(webUrl, slug);
            }

            // Set the page its description
            if (description) {
              setProgress(`Setting page description for ${relPath}`);
              await PagesHelper.setPageDescription(webUrl, slug, description);
            }

            if (existed) {
              StatusHelper.addPageUpdated();
            } else {
              StatusHelper.addPageCreated();
            }

            // Record hash so future runs can skip unchanged files and resume reliably
            if (!options.disableStatePersistence) {
              StateHelper.markPublished(slug, contentHash);
              await StateHelper.save(
                webUrl,
                options.assetLibrary,
                options.stateFile,
              );
            }
          } else {
            setProgress(`Skipped (already exists): ${relPath}`);
            Logger.debug(`Skipping "${relPath}" as it already exists`);
            StatusHelper.addPageSkipped();
          }
        }

        // Check if the file contains a menu element to add too and if not in draft status (cannot add draft pages to navigation)
        this.addToNavigation(
          webUrl,
          output,
          markup.data as PageFrontMatter,
          slug,
          title,
        );

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
        const escapedImgSource = imgSource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        contents = contents.replace(new RegExp(escapedImgSource, "g"), imgUrl);
        StatusHelper.addImage();
      } catch (e) {
        const errorMessage = getErrorMessage(e);
        return Promise.reject(
          new Error(
            `Something failed while uploading the image asset. ${errorMessage}`,
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

        if (!mdData.data.slug && !mdData.data.title) {
          Logger.debug(
            `Skipping link target without title/slug front matter: ${mdFilePath}`,
          );
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
