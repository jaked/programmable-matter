export type Text = {
  text: string,
}

export type P = {
  type: 'p',
  children: Node[],
}

export type Node = Text | P
