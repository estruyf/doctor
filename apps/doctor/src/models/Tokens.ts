export interface Token {
  type: string;
  tag: string;
  attrs?: any;
  map: number[];
  nesting: number;
  level: number;
  children?: any;
  content: string;
  markup: string;
  info: string;
  meta?: any;
  block: boolean;
  hidden: boolean;
}