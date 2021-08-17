import { Point } from 'slate';

// subset of token types  returned by computeJsSpans
export type tokenType =
  'default' | 'boolean' | 'number' | 'string' | 'keyword' |
  'definition' | 'variable' | 'property' | 'link';

export type Span = {
  start: number,
  end: number,
  tokenType: tokenType,
  status?: string,
  link?: string,
};

export type Range = {
  anchor: Point;
  focus: Point;
  color: string;
  status?: string;
  link?: string;
}
