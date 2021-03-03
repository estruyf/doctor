export interface Shortcode {
  [name: string]: ShortcodeRender;
}

export interface ShortcodeRender {
  render: (attr: any, markup: string) => Promise<string> | string,
  beforeMarkdown: boolean
}