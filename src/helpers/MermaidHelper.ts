import { createHash } from "crypto";
import * as cheerio from "cheerio";
import { decode } from "html-entities";
import { CliCommand } from "./CliCommand.js";
import { FileHelpers } from "./FileHelpers.js";
import { FolderHelpers } from "./FolderHelpers.js";
import { Logger } from "./Logger.js";
import { OutputHelper } from "./OutputHelper.js";
import { TempDataHelper } from "./TempDataHelper.js";

/**
 * A rendered diagram, with the size Mermaid drew it at.
 */
export interface MermaidDiagram {
  svg: string;
  width: number;
  height: number;
}

/**
 * A diagram that is ready for a page, with the address to load it from.
 */
export interface MermaidImage extends MermaidDiagram {
  src: string;
}

/**
 * The DOM globals Mermaid reads, plus the originals they replaced.
 */
interface MermaidRuntime {
  mermaid: {
    initialize: (config: Record<string, unknown>) => void;
    render: (id: string, definition: string) => Promise<{ svg: string }>;
  };
  window: any;
}

/**
 * Renders Mermaid diagrams to SVG while publishing.
 *
 * Doctor hands its HTML to the SharePoint Markdown web part as an HTML string,
 * which the web part injects into the page. Script elements created by parsing
 * an HTML string are flagged "already started" and never execute, so a
 * client-side Mermaid loader can never run from that HTML. What did render the
 * diagrams was SharePoint's own Mermaid build, which picks up any
 * `pre.mermaid` on the page and is a major version behind - hence diagrams that
 * only sometimes appeared, and error output naming a version Doctor never
 * loaded.
 *
 * Rendering here instead means the page receives a finished diagram: the
 * Mermaid version is the one pinned in `package.json`, and SharePoint is left
 * with nothing to take over.
 *
 * The result is handed over as an `<img>` holding the SVG, not as inline SVG.
 * SharePoint sanitizes the HTML it injects: it removes `<style>` elements and
 * the root `<svg>` itself, which leaves the shapes behind without a coordinate
 * system to place them in and without the colours that go with them. Inside an
 * image the SVG is a document of its own, which the sanitizer never reaches.
 */
export class MermaidHelper {
  private static runtime: Promise<MermaidRuntime | null> | null = null;

  public static reset() {
    MermaidHelper.runtime = null;
  }

  /**
   * The address the page should load a rendered diagram from.
   *
   * While publishing that is the asset library, the same place the images of a
   * page go. SharePoint refuses a `data:` source on an image, so the SVG has to
   * be a file it serves itself. Without a site to publish to - a local render or
   * a test - the diagram is carried inline instead.
   * @param diagram
   * @param id Doubles as the file name, so the same diagram keeps its file.
   */
  private static async source(
    diagram: MermaidDiagram,
    id: string
  ): Promise<string | null> {
    const options = CliCommand.options;
    const inline = `data:image/svg+xml;base64,${Buffer.from(
      diagram.svg,
      "utf8"
    ).toString("base64")}`;

    if (!options?.webUrl || !options?.assetLibrary) {
      return inline;
    }

    try {
      const folder = await FolderHelpers.create(
        options.assetLibrary,
        [MermaidHelper.ASSET_FOLDER],
        options.webUrl
      );
      const path = await TempDataHelper.createFile(`${id}.svg`, diagram.svg);

      return await FileHelpers.create(
        folder,
        path,
        options.webUrl,
        !!options.overwriteImages
      );
    } catch (e: any) {
      OutputHelper.warning(
        `Doctor could not upload a Mermaid diagram to the asset library: ${
          e?.message || e
        }. The diagram is published as-is, and SharePoint will try to render it instead.`
      );
      Logger.debug(`Mermaid upload failed for "${id}": ${e?.stack || e}`);
      return null;
    }
  }

  private static readonly ASSET_FOLDER = "mermaid";

  /**
   * Render a Mermaid definition to an SVG.
   * @param markup The diagram definition as it was written in the shortcode.
   * @returns The diagram, the size it was drawn at and where the page can load
   * it from, or `null` when the diagram could not be rendered.
   */
  public static async render(markup: string): Promise<MermaidImage | null> {
    // The definition reaches us straight from the HTML source, so entities like
    // `&lt;` are still encoded. Mermaid needs the characters they stand for.
    const definition = decode(markup ?? "").trim();
    if (!definition) {
      return null;
    }

    const runtime = await MermaidHelper.load();
    if (!runtime) {
      return null;
    }

    // Mermaid scopes the styles it generates with `#<id>`, so the id has to be
    // unique per diagram. Deriving it from the definition keeps the output
    // stable between runs, which a hash comparison of published HTML relies on.
    const id = `doctor-mermaid-${createHash("sha256")
      .update(definition)
      .digest("hex")
      .substring(0, 10)}`;

    const diagram = await MermaidHelper.withDomGlobals(runtime, async () => {
      try {
        const { svg } = await runtime.mermaid.render(id, definition);
        return MermaidHelper.prepareSvg(svg, id);
      } catch (e: any) {
        const message = (e?.message || e || "").toString().split("\n")[0];
        OutputHelper.warning(
          `Doctor could not render a Mermaid diagram: ${message}. The diagram is published as-is, and SharePoint will try to render it instead.`
        );
        Logger.debug(`Mermaid render failed for "${id}": ${e?.stack || e}`);
        return null;
      }
    });

    if (!diagram) {
      return null;
    }

    const src = await MermaidHelper.source(diagram, id);

    return src ? { ...diagram, src } : null;
  }

  /**
   * Load Mermaid and the DOM implementation it renders against. Both are pulled
   * in lazily: they are only needed by pages that hold a diagram, and together
   * they are by far the heaviest import Doctor has.
   */
  private static load(): Promise<MermaidRuntime | null> {
    if (!MermaidHelper.runtime) {
      MermaidHelper.runtime = MermaidHelper.createRuntime();
    }

    return MermaidHelper.runtime;
  }

  private static async createRuntime(): Promise<MermaidRuntime | null> {
    try {
      // A non-literal specifier keeps these out of the module graph, so the
      // import only costs anything once a diagram is actually published.
      const load = (specifier: string): Promise<any> => import(specifier);

      const [svgdom, jsdom, dompurify] = await Promise.all([
        load("svgdom"),
        load("jsdom"),
        load("dompurify"),
      ]);

      const createDOMPurify = dompurify.default ?? dompurify;
      // Without a browser, DOMPurify's export is a factory rather than an
      // instance. Mermaid calls `.sanitize()` on the export directly, so the
      // instance is folded back onto the factory it imported.
      Object.assign(
        createDOMPurify,
        createDOMPurify(new jsdom.JSDOM("").window)
      );

      const window = svgdom.createHTMLWindow();
      MermaidHelper.addCanvasSupport(window);

      // Mermaid reads the DOM at import time as well, so the globals go up
      // before it is loaded and stay up until it has been configured.
      const restore = MermaidHelper.applyDomGlobals(window);
      try {
        const mermaid = (await load("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          // svgdom has no HTML layout, so labels have to be drawn as SVG text
          // instead of being measured inside a foreignObject.
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          themeVariables: {
            // The backdrop of an edge label is sized from the text it covers,
            // which svgdom cannot measure exactly. The result is a grey block
            // next to its label, so the label is drawn on the diagram itself.
            edgeLabelBackground: "transparent",
          },
        });

        return { mermaid, window };
      } finally {
        restore();
      }
    } catch (e: any) {
      OutputHelper.warning(
        `Doctor could not load Mermaid, so diagrams are published as-is for SharePoint to render: ${
          e?.message || e
        }`
      );
      Logger.debug(`Mermaid could not be loaded: ${e?.stack || e}`);
      return null;
    }
  }

  /**
   * Give the HTML elements Cytoscape works with the few browser APIs it needs.
   *
   * The `architecture` and `mindmap` diagrams lay their nodes out with
   * Cytoscape, which builds a canvas renderer as soon as it is handed a
   * container: it asks that container for a drawing context and for its size,
   * and gives up when either is missing. Mermaid only reads the coordinates
   * Cytoscape calculates and draws the SVG itself, so nothing is ever painted
   * and a canvas that does nothing is enough to get the layout out of it.
   *
   * Only elements from `createElement` are touched, which are always HTML.
   * Mermaid measures its own SVG through `createElementNS`, where svgdom does
   * implement these and gives real numbers.
   */
  private static addCanvasSupport(window: any) {
    const document = window.document;
    const createElement = document.createElement.bind(document);

    // Cytoscape's renderer asks for the next animation frame forever, and
    // svgdom schedules those as timers. Node stays alive while a timer is
    // pending, so without this a publish never ends once a diagram has used
    // Cytoscape. Unreferencing them keeps the loop running for as long as
    // there is other work, and lets the process finish when there is not.
    const requestAnimationFrame = window.requestAnimationFrame?.bind(window);
    if (requestAnimationFrame) {
      window.requestAnimationFrame = (callback: any) => {
        const handle = requestAnimationFrame(callback);
        handle?.unref?.();
        return handle;
      };
    }

    document.createElement = (tagName: string, ...rest: any[]) => {
      const element = createElement(tagName, ...rest);

      if (`${tagName}`.toLowerCase() === "canvas" && !element.getContext) {
        element.getContext = () => MermaidHelper.canvasContext(element);
      }

      // svgdom raises on an HTML element, and Cytoscape divides by the size it
      // reports, so it is given a viewport to lay the diagram out in.
      element.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: MermaidHelper.VIEWPORT,
        bottom: MermaidHelper.VIEWPORT,
        width: MermaidHelper.VIEWPORT,
        height: MermaidHelper.VIEWPORT,
      });

      return element;
    };

    MermaidHelper.addElementSupport(window);
  }

  private static readonly VIEWPORT = 1000;

  /**
   * Fill in the parts of the DOM svgdom leaves out, on the prototype both HTML
   * and SVG elements share. Mermaid reaches for them while laying a diagram
   * out, and a missing one takes down the whole render.
   */
  private static addElementSupport(window: any) {
    const prototype = window.Element?.prototype;
    if (!prototype) {
      return;
    }

    const define = (name: string, descriptor: PropertyDescriptor) => {
      if (!(name in prototype)) {
        Object.defineProperty(prototype, name, {
          configurable: true,
          ...descriptor,
        });
      }
    };

    define("parentElement", {
      get(this: any) {
        const parent = this.parentNode;
        return parent && parent.nodeType === 1 ? parent : null;
      },
    });

    // Read to decide how wide a diagram may become. Mermaid and Cytoscape both
    // fall back to a default when it is missing, but only after reading it.
    define("offsetWidth", { get: () => MermaidHelper.VIEWPORT });
    define("offsetHeight", { get: () => MermaidHelper.VIEWPORT });

    define("compareDocumentPosition", {
      value(this: any, other: any) {
        if (this === other) {
          return 0;
        }

        const path = (node: any): number[] => {
          const indexes: number[] = [];
          for (let step = node; step?.parentNode; step = step.parentNode) {
            const siblings = step.parentNode.childNodes || [];
            indexes.unshift(Array.prototype.indexOf.call(siblings, step));
          }
          return indexes;
        };

        const mine = path(this);
        const theirs = path(other);

        for (let i = 0; i < Math.max(mine.length, theirs.length); i++) {
          const a = mine[i];
          const b = theirs[i];

          if (a === b) {
            continue;
          }

          // 4 is DOCUMENT_POSITION_FOLLOWING, 2 is DOCUMENT_POSITION_PRECEDING.
          if (a === undefined) {
            return 4 + 16; // `other` is contained by this element
          }
          if (b === undefined) {
            return 2 + 8; // this element is contained by `other`
          }
          return a < b ? 4 : 2;
        }

        return 0;
      },
    });
  }

  private static canvasContext(canvas: any) {
    const context: Record<string | symbol, any> = { canvas };

    return new Proxy(context, {
      get: (target, property) => {
        if (property in target) {
          return target[property];
        }

        // Text is measured to size a label. Cytoscape only compares the results
        // against each other, so an estimate keeps the layout sensible.
        if (property === "measureText") {
          return (text: string) => ({ width: `${text ?? ""}`.length * 8 });
        }

        return () => undefined;
      },
      set: (target, property, value) => {
        target[property] = value;
        return true;
      },
    });
  }

  /**
   * Expose the DOM globals Mermaid expects for the duration of `action`, and
   * put back whatever was there before. They are not left in place, because a
   * `window` on `globalThis` makes other dependencies believe they run in a
   * browser.
   */
  private static async withDomGlobals<T>(
    runtime: MermaidRuntime,
    action: () => Promise<T>
  ): Promise<T> {
    const restore = MermaidHelper.applyDomGlobals(runtime.window);
    try {
      return await action();
    } finally {
      restore();
    }
  }

  private static applyDomGlobals(window: any): () => void {
    const target = globalThis as any;
    const previous = {
      window: target.window,
      document: target.document,
      CSSStyleSheet: target.CSSStyleSheet,
    };

    target.window = window;
    target.document = window.document;
    // Mermaid builds its stylesheet through the constructable stylesheet API,
    // which neither svgdom nor jsdom implements.
    target.CSSStyleSheet = target.CSSStyleSheet ?? MermaidHelper.styleSheetStub;

    return () => {
      target.window = previous.window;
      target.document = previous.document;
      target.CSSStyleSheet = previous.CSSStyleSheet;
    };
  }

  /**
   * Enough of a stylesheet for Mermaid, which collects the rules it generates
   * through `insertRule` and reads them back as `cssText`.
   *
   * Deliberately without `replaceSync`: Mermaid checks for it to decide whether
   * it can round-trip a `themeCSS` through a stylesheet, and falls back to
   * passing the CSS on untouched. A `replaceSync` that does not parse would
   * swallow that theme instead.
   */
  private static readonly styleSheetStub = class {
    public cssRules: { cssText: string }[] = [];

    public insertRule(rule: string) {
      this.cssRules.push({ cssText: rule });
      return this.cssRules.length - 1;
    }
  };

  /**
   * Prepare the SVG for the Markdown web part.
   *
   * The diagram travels to the page as its own document inside an `<img>`, so
   * its stylesheet is applied by the browser rather than by the page. Mermaid
   * still describes the size of a diagram in a `style` attribute on the root,
   * which is turned into `width`/`height` so the image can be sized without it,
   * and the `style` attributes of a `style`/`classDef` statement are lifted into
   * the stylesheet so nothing depends on inline styles surviving.
   */
  private static prepareSvg(rendered: string, id: string): MermaidDiagram {
    const $ = cheerio.load(rendered, {
      xml: {
        xmlMode: true,
        decodeEntities: false,
      },
    });

    const $svg = $("svg").first();

    // Mermaid sizes the diagram with `width="100%"` plus a `max-width` style.
    // Once that style is gone the diagram stretches, so the size the viewBox
    // describes is written out as attributes instead. Scaling down on a narrow
    // page is left to the `.doctor__mermaid` stylesheet.
    $svg.removeAttr("style");
    let width = MermaidHelper.VIEWPORT;
    let height = MermaidHelper.VIEWPORT;
    const viewBox = ($svg.attr("viewBox") || "").split(/[\s,]+/).map(Number);
    if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
      width = Math.ceil(viewBox[2]);
      height = Math.ceil(viewBox[3]);
      $svg.attr("width", `${width}`);
      $svg.attr("height", `${height}`);
    }

    const rules: string[] = [];
    const classNames = new Map<string, string>();

    $("[style]").each((_index, element) => {
      const $element = $(element);
      const declarations = MermaidHelper.important($element.attr("style"));
      $element.removeAttr("style");

      if (!declarations) {
        return;
      }

      let className = classNames.get(declarations);
      if (!className) {
        className = `${id}-s${classNames.size}`;
        classNames.set(declarations, className);
        // Mermaid styles its shapes through `#<id> .node rect` and the like, so
        // the class is repeated to outweigh that selector. `!important` alone
        // would be enough for a browser, but not every renderer of an SVG
        // implements that part of the cascade.
        rules.push(`#${id} .${className}.${className}{${declarations}}`);
      }

      $element.addClass(className);
    });

    let markup = $.html();

    if (rules.length > 0) {
      const stylesheet = rules.join("");
      markup = markup.includes("</style>")
        ? markup.replace("</style>", `${stylesheet}</style>`)
        : markup.replace(/(<svg[^>]*>)/, `$1<style>${stylesheet}</style>`);
    }

    const svg = markup
      .replace(/<\?xml[^>]*\?>/g, "")
      .replace(/<!DOCTYPE[^>]*>/gi, "")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .join("\n")
      .trim();

    return { svg, width, height };
  }

  /**
   * A `style` attribute outranks every selector, which is precedence the
   * declarations have to keep now that they are moved into the stylesheet.
   */
  private static important(style: string | undefined): string {
    return (style || "")
      .split(";")
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration !== "")
      .map((declaration) =>
        declaration.includes("!important")
          ? declaration
          : `${declaration} !important`
      )
      .join(";");
  }
}
