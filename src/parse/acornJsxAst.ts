// See
//  https://github.com/acornjs/acorn
//  https://github.com/RReverser/acorn-jsx

interface NodeImpl {
  type: string;
  start: number;
  end: number;
}

export interface Program extends NodeImpl {
  type: 'Program';
  body: Array<ExpressionStatement>;
  sourceType: 'module';
}

export interface ExpressionStatement extends NodeImpl {
  type: 'ExpressionStatement';
  expression: JSXElement;
}

export interface JSXText extends NodeImpl {
  type: 'JSXText';
  value: string;
  raw: string; // ?
}

export interface JSXElement extends NodeImpl {
  type: 'JSXElement';
  openingElement: JSXOpeningElement;
  closingElement: JSXClosingElement | null;
  children: Array<JSXElement | JSXText | JSXExpressionContainer >;
}

export interface JSXOpeningElement extends NodeImpl {
  type: 'JSXOpeningElement';
  attributes: Array<JSXAttribute>;
  name: JSXIdentifier;
  selfClosing: boolean;
}

export interface JSXClosingElement extends NodeImpl {
  type: 'JSXClosingElement';
}

export interface JSXAttribute extends NodeImpl {
  type: 'JSXAttribute';
  name: JSXIdentifier;
  value: JSXExpressionContainer | Literal;
}

export interface JSXIdentifier extends NodeImpl {
  type: 'JSXIdentifier';
  name: string;
}

export interface JSXExpressionContainer extends NodeImpl {
  type: 'JSXExpressionContainer';
  expression: Expression;
}

export interface Literal extends NodeImpl {
  type: 'Literal';
  value: string | number | boolean; // others?
  raw: string;
}

export interface Identifier extends NodeImpl {
  type: 'Identifier';
  name: string;
}

export interface ObjectExpression extends NodeImpl {
  type: 'ObjectExpression';
  properties: Array<Property>;
}

export interface Property extends NodeImpl {
  type: 'Property';
  method: boolean;
  shorthand: boolean;
  computed: boolean;
  key: Identifier; // TODO(jaked) can be other things
  value: Expression;
  kind: 'init'; // ???
}

export type Expression =
  Literal |
  Identifier |
  JSXElement |
  ObjectExpression;

export type Node = Program | ExpressionStatement | JSXElement;
