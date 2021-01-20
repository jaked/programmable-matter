import JSON5 from 'json5';
import * as Highlight from './lang/highlight';

// TODO(jaked) split into Text / Code leaf types?
export type Text = {
  text: string,
  bold?: true,
  italic?: true,
  underline?: true,
  strikethrough?: true,

  // TODO(jaked) code should suppress other styling
  code?: true,

  // decorations
  highlight?: Highlight.tag,
  status?: string,
  link?: string,
}

export type mark = 'bold' | 'italic' | 'underline' | 'code';

export type type =
  'p' |
  'h1' | 'h2' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' |
  'ul' | 'ol' | 'li' |
  'code' | 'inlineCode' |
  'blockquote' | 'pre' |
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
  type: 'ul' | 'ol',
  children: Node[],
}

export type ListItem = {
  type: 'li',
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

export type Blockquote = {
  type: 'blockquote',
  children: Node[],
}

export type Pre = {
  type: 'pre',
  children: Node[],
}

export type Block = Paragraph | Header | List | Code | Blockquote | Pre;
export type Inline = Link | InlineCode;

export type Element = Block | Inline | ListItem;
export type Node = Text | Element;

export function parse(pm: string): Node[] {
  const nodes = JSON5.parse(pm);
  // TODO(jaked) validate
  return nodes;
}

export function stringify(nodes: Node[]): string {
  return JSON5.stringify(nodes, undefined, 2);
}

export function isText(node: Node): node is Text {
  return 'text' in node;
}

export function isElement(node: Node): node is Element {
  return 'type' in node;
}

export function isParagraph(node: Node): node is Paragraph {
  return isElement(node) && node.type === 'p';
}

export function isHeader(node: Node): node is Header {
  if (isElement(node)) {
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

export function isList(node: Node): node is List {
  return isElement(node) && (node.type === 'ol' || node.type === 'ul');
}

export function isListItem(node: Node): node is ListItem {
  return isElement(node) && node.type === 'li';
}

export function isCode(node: Node): node is Code {
  return isElement(node) && node.type === 'code';
}

export function isInlineCode(node: Node): node is InlineCode {
  return isElement(node) && node.type === 'inlineCode';
}

export function isLink(node: Node): node is Link {
  return isElement(node) && node.type === 'a';
}

export function isBlockquote(node: Node): node is Blockquote {
  return isElement(node) && node.type === 'blockquote';
}

export function isPre(node: Node): node is Pre {
  return isElement(node) && node.type === 'pre';
}

function invalid(msg: string): never {
  throw new Error(msg);
}

function validateLink(link: Link) {
  if (link.children.length === 0)
    invalid(`expected > 0 children`);
  link.children.forEach(node => {
    if (!isText(node))
      invalid('expected a > text');
  });
}

function validateInlineCode(code: InlineCode) {
  if (code.children.length !== 1)
    invalid(`expected 1 child`);
  code.children.forEach(node => {
    if (!isText(node))
      invalid('expected code > text');
  });
}

function validateParagraph(p: Paragraph) {
  if (p.children.length === 0)
    invalid(`expected > 0 children`);
  p.children.forEach(node => {
    if (isText(node)) {} // ok
    else if (isLink(node)) validateLink(node);
    else if (isInlineCode(node)) validateInlineCode(node);
    else
      invalid('expected p > (text | a | inlineCode)+');
  });
}

function validateHeader(h: Header) {
  h.children.forEach(node => {
    if (!isText(node))
      invalid(`expected ${h.type} > text`);
  });
}

function validateListItem(item: ListItem) {
  if (item.children.length === 0)
    invalid(`expected > 0 children`);
  item.children.forEach(node => {
    if (isParagraph(node)) validateParagraph(node);
    else if (isBlockquote(node)) validateBlockquote(node);
    else if (isList(node)) validateList(node);
    else if (isPre(node)) validatePre(node);
    else
      invalid(`expected li > p (p | ul | ol | blockquote | pre)*`);
  });
  // TODO(jaked) relax this?
  if (!isParagraph(item.children[0]))
    invalid(`expected li > p (p | ul | ol | blockquote | pre)*`)
}

function validateList(list: List) {
  list.children.forEach(node => {
    if (!isListItem(node))
      invalid(`expected ${list.type} > li`);
    validateListItem(node);
  });
}

function validateCode(code: Code) {
  if (code.children.length !== 1)
    invalid(`expected 1 child`);
  code.children.forEach(node => {
    if (!isText(node))
      invalid('expected code > text');
  });
}

function validateBlockquote(blockquote: Blockquote) {
  if (blockquote.children.length === 0)
    invalid(`expected > 0 children`);
  blockquote.children.forEach(node => {
    // TODO(jaked) permit other content
    // see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/blockquote
    if (isParagraph(node)) validateParagraph(node);
    else if (isList(node)) validateList(node);
    else invalid('expected blockquote > (p | ul | ol)*');
  });
}

function validatePre(pre: Pre) {
  if (pre.children.length !== 1)
    invalid(`expected 1 child`);
  pre.children.forEach(node => {
    if (!isText(node))
      invalid('expected pre > text');
  });
}

function validateBlock(node: Node) {
  if (isParagraph(node)) validateParagraph(node);
  else if (isHeader(node)) validateHeader(node);
  else if (isList(node)) validateList(node);
  else if (isCode(node)) validateCode(node);
  else if (isBlockquote(node)) validateBlockquote(node);
  else if (isPre(node)) validatePre(node);
  else if (isElement(node))
    invalid(`expected block, got ${node.type}`);
  else if (isText(node))
    invalid('expected block, got text');
}

export function validateNodes(nodes: Node[]) {
  nodes.forEach(validateBlock);
}