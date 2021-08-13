import { Point } from 'slate';

export type component = React.FunctionComponent<{}>;

export type components = {
  default: component,
  atom: component,
  number: component,
  string: component,
  keyword: component,
  definition: component,
  variable: component,
  property: component,
  link: component,
}

export type tag =
  'default' | 'atom' | 'number' | 'string' | 'keyword' |
  'definition' | 'variable' | 'property' | 'link';

export type Span = {
  start: number,
  end: number,
  tag: tag,
  status?: string,
  link?: string,
};

export type Range = {
  anchor: Point;
  focus: Point;
  highlight: tag;
  status?: string;
  link?: string;
}
