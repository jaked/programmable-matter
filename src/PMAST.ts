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

export type P = {
  type: 'p',
  children: Node[],
}

export type Node = Text | P

export function parse(pm: string): Node[] {
  const nodes = JSON5.parse(pm);
  // TODO(jaked) validate
  return nodes;
}

export function stringify(nodes: Node[]): string {
  return JSON5.stringify(nodes, undefined, 2);
}
