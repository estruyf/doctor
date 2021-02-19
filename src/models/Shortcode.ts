export interface Shortcode {
  [name: string]: {
    render: (attr: any, markup: string) => Promise<string> | string
  }
}