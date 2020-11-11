import JSON5 from 'json5';

export type Text = {
  text: string,
  bold?: true,
  italic?: true,
  underline?: true,
  code?: true,
}

// TODO(jaked) figure out how to compute this from `Text` fields
export type mark = 'bold' | 'italic' | 'underline' | 'code';

export type type =
  'p' |
  'h1' | 'h2' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' |
  'ul' | 'ol' | 'li' |
  'a';

export type Paragraph = {
  type: 'p',
  children: Node[],
}

export type Header = {
  type: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
  children: Node[],
}

export type List = {
  type: 'ul' | 'ol' | 'li',
  children: Node[],
}

export type Link = {
  type: 'a',
  href: string,
  children: Node[],
}

export type Code = {
  type: 'code',
  children: Node[],
}

export type InlineCode = {
  type: 'inlineCode',
  children: Node[],
}

export type Block = Paragraph | Header | List | Code;
export type Inline = Link | InlineCode;

// TODO(jaked)
// should this type encode more validation of tree?
// e.g. prohibition on headers appearing in lists
export type Element = Block | Inline;
export type Node = Text | Element;

export function parse(pm: string): Node[] {
  const nodes = JSON5.parse(pm);
  // TODO(jaked) validate
  return nodes;
}

export function stringify(nodes: Node[]): string {
  return JSON5.stringify(nodes, undefined, 2);
}

export function isHeader(node: Node): boolean {
  if (node && `type` in node) {
    switch (node.type) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return true;
      default:
        return false;
    }
  }
  return false;
}
