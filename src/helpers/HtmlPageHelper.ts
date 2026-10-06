import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { load } from "cheerio";
import { encode } from "html-entities";
import mime from "mime";
import { CommandArguments, PageFrontMatter } from "@models";
import { toODataPath } from "@utils";
import { htmlPageCss } from "../styles/htmlPage.js";
import { AccessToken } from "./AccessToken.js";
import { ApiHelper } from "./ApiHelper.js";
import { CliCommand } from "./CliCommand.js";
import { FolderHelpers } from "./FolderHelpers.js";
import { Logger } from "./Logger.js";
import { MarkdownHelper } from "./MarkdownHelper.js";
import { OutputHelper } from "./OutputHelper.js";
import { executeWithRetry } from "./RunCommand.js";
import { TempDataHelper } from "./TempDataHelper.js";

export interface SandboxIssue {
  element: string;
  reason: string;
  /** `link`: a link the viewer will not open, reported per page rather than one by one */
  kind?: "link";
}

/**
 * The values a page template is filled with. `title`, `description` and `lang`
 * are text and get escaped; the others are markup and go in as they are.
 */
export interface HtmlTemplateValues {
  title: string;
  description: string;
  lang: string;
  styles: string;
  header: string;
  content: string;
}

/**
 * The layout an HTML page gets when `html.template` names none. A custom
 * template uses the same placeholders.
 */
export const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="{{ lang }}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="generator" content="doctor" />
  <title>{{ title }}</title>
  <meta name="description" content="{{ description }}" />
  <style>{{ styles }}</style>
</head>
<body>
{{ header }}
<main class="doctor-page">
  <article class="doctor-content">
{{ content }}
  </article>
</main>
</body>
</html>
`;

const ESCAPED_VALUES: (keyof HtmlTemplateValues)[] = [
  "title",
  "description",
  "lang",
];

/** Long enough for a large picture on a slow link, short enough not to hang a run */
const REMOTE_IMAGE_TIMEOUT = 30000;

/** The hosts the HTML viewer opens a link to, besides the tenant's own SharePoint */
const LINK_ALLOWLIST = ["microsoft.ghe.com", "onedrive.cloud.microsoft", "1drv.ms"];

/** The byte order mark the viewer's contract asks a page to start with */
const BOM = "\uFEFF";

/**
 * Builds and publishes the self-contained HTML documents SharePoint renders as
 * HTML pages (roadmap 569208).
 *
 * SharePoint shows such a page in an `<iframe sandbox="allow-scripts">` under
 * a strict Content Security Policy, which it documents at `/_html` on every
 * tenant: inline `<style>`, `<script>` and `<svg>` work, but nothing is
 * fetched from elsewhere — no stylesheet or script from a URL, no `fetch`, and
 * images only as `data:` or `blob:` URIs. So a page has to carry what it needs
 * inside the one file: every image is inlined, rather than uploaded to the
 * asset library as the web part pages do. Links only open to the tenant's own
 * SharePoint and a short Microsoft allowlist.
 */
export class HtmlPageHelper {
  private static templates: { [path: string]: string } = {};
  private static remoteImages: { [url: string]: string | null } = {};

  public static reset(): void {
    HtmlPageHelper.templates = {};
    HtmlPageHelper.remoteImages = {};
  }

  /**
   * Render a page's markdown to the complete HTML document that gets uploaded.
   *
   * The markdown goes through the same pipeline as a Markdown web part's —
   * shortcodes, highlighted code, table of contents, extended syntax — so a
   * page reads the same in either mode. Partials are already in it by now.
   * @param markdown the page content, partials injected and links resolved
   * @param data the page's front matter
   * @param file the markdown file, which relative images resolve against
   * @param options the run's options
   */
  public static async render(
    markdown: string,
    data: PageFrontMatter,
    file: string,
    options: CommandArguments,
  ): Promise<string> {
    const body = await HtmlPageHelper.inlineImages(
      await MarkdownHelper.getHtmlData(markdown, options, false),
      file,
      options.webUrl,
    );

    const template = await HtmlPageHelper.getTemplate(options);
    const customStyles = options.htmlStyles
      ? await HtmlPageHelper.readSetting(options.htmlStyles, "html.styles")
      : "";

    const document = HtmlPageHelper.fillTemplate(template, {
      title: data.title,
      description: data.description || "",
      lang: "en",
      styles: [MarkdownHelper.getStyles(), htmlPageCss, customStyles]
        .filter(Boolean)
        .join("\n"),
      header: await HtmlPageHelper.renderHeader(data, file, options.webUrl),
      content: body,
    });

    // A custom shortcode, a partial or a template can still bring in what the
    // sandbox blocks. Said now, as the page would otherwise just miss it.
    const issues = HtmlPageHelper.getSandboxIssues(document, options.webUrl);
    for (const issue of issues.filter((issue) => issue.kind !== "link")) {
      OutputHelper.warning(
        `"${data.title}": ${issue.element} — ${issue.reason}.`,
      );
    }

    // A documentation page can link out a lot, so the links are summed up
    // instead of each getting a warning of its own
    const links = issues.filter((issue) => issue.kind === "link");
    if (links.length > 0) {
      const targets = [...new Set(links.map((issue) => issue.element))];
      const examples = targets.slice(0, 3).join(", ");
      OutputHelper.warning(
        `"${data.title}": ${links.length} link${links.length === 1 ? "" : "s"} the HTML page viewer will not open (${examples}${targets.length > 3 ? ", …" : ""}). It only opens links to this tenant's SharePoint.`,
      );
    }

    return document;
  }

  /**
   * The contents of the file that gets uploaded: the page as UTF-8 with a byte
   * order mark. The viewer's contract asks for one, and SharePoint's own upload
   * API adds it; uploading through the CLI keeps the bytes as they are, so
   * without it a page's accents and emoji could be read in the wrong encoding.
   */
  public static toFileContents(document: string): string {
    return document.startsWith(BOM) ? document : `${BOM}${document}`;
  }

  /**
   * Fill in the `{{ name }}` placeholders of a template. One pass over the
   * template only, so a placeholder written in the page content — a code
   * sample documenting this very feature — is left alone.
   */
  public static fillTemplate(
    template: string,
    values: HtmlTemplateValues,
  ): string {
    return template.replace(
      /\{\{\s*(\w+)\s*\}\}/g,
      (match, name: keyof HtmlTemplateValues) => {
        if (!(name in values)) {
          return match;
        }
        return ESCAPED_VALUES.includes(name)
          ? encode(values[name])
          : values[name];
      },
    );
  }

  /**
   * The page's banner: its title and description, over the `header.image` of
   * the front matter when it has one. `header.type: None` leaves it out, the
   * way it hides the title area of a modern page.
   */
  public static async renderHeader(
    data: PageFrontMatter,
    file: string,
    webUrl: string | null = null,
  ): Promise<string> {
    const header = data.header;
    if (header?.type === "None") {
      return "";
    }

    const showImage =
      !!header?.image &&
      header.layout !== "NoImage" &&
      header.layout !== "ColorBlock";
    const image = showImage
      ? await HtmlPageHelper.toImageSource(header!.image!, file, webUrl)
      : null;

    const classes = [
      "doctor-hero",
      image ? "doctor-hero--image" : "",
      header?.textAlignment === "Center" ? "doctor-hero--center" : "",
    ].filter(Boolean);
    const style = image
      ? ` style="background-image: url('${image}')"`
      : "";
    const label =
      image && header?.altText
        ? ` role="img" aria-label="${encode(header.altText)}"`
        : "";

    return [
      `<header class="${classes.join(" ")}"${style}${label}>`,
      `  <div class="doctor-hero__inner">`,
      `    <h1 class="doctor-hero__title">${encode(data.title)}</h1>`,
      data.description
        ? `    <p class="doctor-hero__description">${encode(data.description)}</p>`
        : "",
      `  </div>`,
      `</header>`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  /**
   * Replace every image with a `data:` URI of its contents: local files,
   * pictures on other hosts, and those on the tenant's own SharePoint, which
   * are read with doctor's own access to the site. An image that cannot be
   * read stays a link, and is reported.
   * @param html the rendered page
   * @param file the markdown file the page comes from, which relative image
   * paths are resolved against
   * @param webUrl the site the page is published to
   */
  public static async inlineImages(
    html: string,
    file: string,
    webUrl: string | null = null,
  ): Promise<string> {
    const $ = load(html, null, false);

    for (const img of $("img").toArray()) {
      const src = $(img).attr("src");
      if (!src) {
        continue;
      }

      const inlined = await HtmlPageHelper.toImageSource(src, file, webUrl);
      if (inlined !== src) {
        $(img).attr("src", inlined);
      }
    }

    return $.html();
  }

  /**
   * Everything in the page the HTML page sandbox blocks, so it can be reported
   * instead of a page being published that silently misses parts.
   * @param html the page
   * @param webUrl the site, whose host is allowed to serve images
   */
  public static getSandboxIssues(
    html: string,
    webUrl: string | null = null,
  ): SandboxIssue[] {
    const $ = load(html);
    const issues: SandboxIssue[] = [];

    $(`link[rel~="stylesheet"]`).each((_, elm) => {
      issues.push({
        element: `<link href="${$(elm).attr("href")}">`,
        reason: "external stylesheets are blocked; inline the CSS instead",
      });
    });

    $("script[src]").each((_, elm) => {
      issues.push({
        element: `<script src="${$(elm).attr("src")}">`,
        reason: "external scripts are blocked; inline the script instead",
      });
    });

    $("iframe, frame, object, embed").each((_, elm) => {
      issues.push({
        element: `<${elm.tagName}>`,
        reason: "embedded frames and objects are blocked",
      });
    });

    $("img[src]").each((_, elm) => {
      const src = $(elm).attr("src")!;
      if (src.startsWith("data:") || src.startsWith("blob:")) {
        return;
      }

      issues.push({
        element: `<img src="${src}">`,
        reason: HtmlPageHelper.isRemote(src)
          ? "images are only shown when they are inside the page, and doctor could not read this one to put it there"
          : "relative images cannot load; doctor could not inline it",
      });
    });

    $("a[href]").each((_, elm) => {
      const href = $(elm).attr("href")!.trim();
      if (!HtmlPageHelper.opensInViewer(href, webUrl)) {
        issues.push({ element: href, reason: "the viewer does not open it", kind: "link" });
      }
    });

    $("form").each(() => {
      issues.push({
        element: `<form>`,
        reason: "form submission is blocked",
      });
    });

    return issues;
  }

  /**
   * Whether the viewer follows a link. It rejects script and `data:` links,
   * and opens a web address only on the tenant's own SharePoint (the sites and
   * OneDrive) or one of a few Microsoft hosts. Links within the page, and
   * relative ones, are its own business.
   * @param href the link
   * @param webUrl the site, whose tenant the links may go to; without it no
   * web address can be judged
   */
  public static opensInViewer(href: string, webUrl: string | null): boolean {
    if (/^(javascript|vbscript|data):/i.test(href)) {
      return false;
    }
    if (!HtmlPageHelper.isRemote(href) || !webUrl) {
      return true;
    }

    let host: string;
    let site: string;
    try {
      host = new URL(href.startsWith("//") ? `https:${href}` : href).hostname.toLowerCase();
      site = new URL(webUrl).hostname.toLowerCase();
    } catch {
      return true;
    }

    // contoso.sharepoint.com also covers contoso-my.sharepoint.com, the
    // tenant's OneDrive, and works the same on the other clouds' domains
    const [tenant, ...domain] = site.split(".");
    const rest = domain.join(".");
    return (
      host === site ||
      host === `${tenant}-my.${rest}` ||
      LINK_ALLOWLIST.includes(host)
    );
  }

  /**
   * Upload the page to the Site Pages library, in the folder its slug names.
   */
  public static async upload(
    webUrl: string,
    slug: string,
    document: string,
  ): Promise<void> {
    const folders = slug.split("/");
    const fileName = folders.pop()!;
    const folder = await FolderHelpers.create("sitepages", folders, webUrl);

    const path = await TempDataHelper.createFile(
      fileName,
      HtmlPageHelper.toFileContents(document),
    );

    Logger.debug(`Uploading the HTML page ${slug} to ${folder}`);
    await executeWithRetry(
      "spo file add",
      {
        webUrl,
        folder,
        path,
        overwrite: true,
      },
      CliCommand.getRetry(),
    );
  }

  /**
   * Leave the uploaded page published, or as a draft.
   *
   * What an upload leaves behind depends on the library: checked out when it
   * requires a check out, a minor version when it keeps them, and published
   * straight away when it keeps neither. Each needs its own step, and a step
   * the library does not need fails — so the page's level decides.
   * @param publish publish the page, rather than leave it as a draft
   */
  public static async finalize(
    webUrl: string,
    slug: string,
    publish: boolean,
  ): Promise<void> {
    const fileUrl = HtmlPageHelper.getFileApiUrl(webUrl, slug);
    const headers = await HtmlPageHelper.getHeaders(webUrl);
    const { Level: level } = await ApiHelper.getOrThrow(
      `${fileUrl}?$select=Level`,
      headers,
    );

    // 255: checked out. Checked in as a major version to publish, as a minor
    // one to keep a draft — leaving it checked out would hide it from everyone
    // but the account doctor runs as.
    if (level === 255) {
      Logger.debug(`Checking in the HTML page ${slug}`);
      await ApiHelper.postOrThrow(
        `${fileUrl}/CheckIn(comment=@a1,checkintype=@a2)?@a1=''&@a2=${publish ? 1 : 0}`,
        headers,
      );
      return;
    }

    // 2: a draft, which is what a library with minor versions leaves
    if (level === 2 && publish) {
      Logger.debug(`Publishing the HTML page ${slug}`);
      await ApiHelper.postOrThrow(
        `${fileUrl}/Publish(comment=@a1)?@a1=''`,
        headers,
      );
    }
  }

  /**
   * The list item id of an HTML page, for setting its metadata. The pages API
   * the CLI's `spo page get` uses only knows modern pages.
   */
  public static async getItemId(
    webUrl: string,
    slug: string,
  ): Promise<number | null> {
    const item = await ApiHelper.getOrThrow(
      `${HtmlPageHelper.getFileApiUrl(webUrl, slug)}/ListItemAllFields?$select=Id`,
      await HtmlPageHelper.getHeaders(webUrl),
    );
    return item?.Id ?? null;
  }

  /**
   * An image as the page can load it: a `data:` URI for a local file or a
   * picture on another host, and the source as it was for anything else.
   */
  private static async toImageSource(
    src: string,
    file: string,
    webUrl: string | null,
  ): Promise<string> {
    if (src.startsWith("data:") || src.startsWith("blob:")) {
      return src;
    }

    if (HtmlPageHelper.isRemote(src)) {
      // The tenant's own images need doctor's access to the site to be read
      const headers = HtmlPageHelper.isTenantUrl(src, webUrl)
        ? await HtmlPageHelper.getHeaders(webUrl!).catch(() => undefined)
        : undefined;
      return (await HtmlPageHelper.fetchImage(src, headers)) ?? src;
    }

    const path = join(dirname(file), decodeURI(src.split(/[?#]/)[0]));
    const type = mime.getType(path);
    if (!type?.startsWith("image/")) {
      throw new Error(
        `The image "${src}" is not a file type doctor can inline into an HTML page.`,
      );
    }

    let contents: Buffer;
    try {
      contents = await readFile(path);
    } catch {
      throw new Error(`The image "${src}" could not be found at "${path}".`);
    }

    return `data:${type};base64,${contents.toString("base64")}`;
  }

  /**
   * Download a picture, as the page cannot load it from where it lives. The
   * tenant's own images are read with doctor's access token. A failure is not
   * fatal: the page is published with the link, and the sandbox check reports
   * it.
   */
  private static async fetchImage(
    src: string,
    headers?: { [name: string]: string },
  ): Promise<string | null> {
    const url = src.startsWith("//") ? `https:${src}` : src;
    if (url in HtmlPageHelper.remoteImages) {
      return HtmlPageHelper.remoteImages[url];
    }

    let inlined: string | null = null;
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT),
      });
      const type = (response.headers.get("content-type") || "")
        .split(";")[0]
        .trim();

      if (!response.ok) {
        Logger.debug(`Image ${url} answered ${response.status}`);
      } else if (!type.startsWith("image/")) {
        Logger.debug(`Image ${url} is served as "${type}", not as an image`);
      } else {
        const contents = Buffer.from(await response.arrayBuffer());
        inlined = `data:${type};base64,${contents.toString("base64")}`;
      }
    } catch (e: any) {
      Logger.debug(`Image ${url} could not be downloaded: ${e?.message || e}`);
    }

    HtmlPageHelper.remoteImages[url] = inlined;
    return inlined;
  }

  private static async getTemplate(options: CommandArguments): Promise<string> {
    if (!options.htmlTemplate) {
      return DEFAULT_HTML_TEMPLATE;
    }

    const template = await HtmlPageHelper.readSetting(
      options.htmlTemplate,
      "html.template",
    );
    if (!/\{\{\s*content\s*\}\}/.test(template)) {
      throw new Error(
        `The HTML template "${options.htmlTemplate}" has no {{ content }} placeholder, so the pages would publish without their content.`,
      );
    }
    return template;
  }

  /** A file a setting names, read once per run */
  private static async readSetting(path: string, setting: string) {
    if (!(path in HtmlPageHelper.templates)) {
      try {
        HtmlPageHelper.templates[path] = await readFile(
          join(process.cwd(), path),
          "utf-8",
        );
      } catch {
        throw new Error(
          `The file "${path}" of the "${setting}" setting could not be read.`,
        );
      }
    }
    return HtmlPageHelper.templates[path];
  }

  private static isRemote(src: string): boolean {
    return /^(https?:)?\/\//i.test(src);
  }

  private static isTenantUrl(src: string, webUrl: string | null): boolean {
    if (!webUrl || !HtmlPageHelper.isRemote(src)) {
      return false;
    }
    try {
      const url = new URL(src.startsWith("//") ? `https:${src}` : src);
      return url.host.toLowerCase() === new URL(webUrl).host.toLowerCase();
    } catch {
      return false;
    }
  }

  private static getFileApiUrl(webUrl: string, slug: string): string {
    const site = new URL(webUrl).pathname.replace(/\/+$/, "");
    return `${webUrl.replace(/\/+$/, "")}/_api/web/GetFileByServerRelativePath(DecodedUrl='${toODataPath(
      `${site}/sitepages/${slug}`,
      true,
    )}')`;
  }

  private static async getHeaders(webUrl: string): Promise<any> {
    return {
      Authorization: `Bearer ${(await AccessToken.get(webUrl)).trim()}`,
      accept: "application/json;odata=nometadata",
    };
  }
}
