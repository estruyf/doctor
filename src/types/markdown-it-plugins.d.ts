// Type declarations for the markdown-it plugins that ship neither their own
// types nor a package on DefinitelyTyped.

declare module "markdown-it-table-of-contents" {
  import { PluginWithOptions } from "markdown-it";

  interface TocOptions {
    includeLevel?: number[];
    containerClass?: string;
    slugify?: (str: string) => string;
    markerPattern?: RegExp;
    listType?: "ul" | "ol";
    format?: (content: string, md: unknown) => string;
    containerHeaderHtml?: string;
    containerFooterHtml?: string;
    transformLink?: (link: string) => string;
  }

  const markdownItTableOfContents: PluginWithOptions<TocOptions>;
  export default markdownItTableOfContents;
}

declare module "markdown-it-mark" {
  import { PluginSimple } from "markdown-it";

  const markdownItMark: PluginSimple;
  export default markdownItMark;
}

declare module "markdown-it-deflist" {
  import { PluginSimple } from "markdown-it";

  const markdownItDeflist: PluginSimple;
  export default markdownItDeflist;
}

declare module "markdown-it-task-lists" {
  import { PluginWithOptions } from "markdown-it";

  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }

  const markdownItTaskLists: PluginWithOptions<TaskListsOptions>;
  export default markdownItTaskLists;
}
