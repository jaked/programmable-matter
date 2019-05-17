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
  body: Array<ExpressionStatement | ImportDeclaration | ExportNamedDeclaration>;
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

  // TODO(jaked) tighten this up
  // Acorn returns only actual literals here,
  // but we abuse this field to mean a constant sub-expression
  // in Evaluator.evaluateExpression
  value: any;
}

export interface Identifier extends NodeImpl {
  type: 'Identifier';
  name: string;
}

export interface BinaryExpression extends NodeImpl {
  type: 'BinaryExpression';
  left: Expression;
  operator:
    '+' | '-' | '*' | '/' | '**' | '%' |
    '==' | '!=' | '===' | '!==' |
    '<' | '<=' | '>' | '>=' | '||' | '&&' |
    '|' | '&' | '^' | '<<' | '>>' | '>>>';
  right: Expression;
}

export interface MemberExpression extends NodeImpl {
  type: 'MemberExpression';
  object: Expression;
  property: Expression;
  computed: boolean;
}

export interface Property extends NodeImpl {
  type: 'Property';
  method: boolean;
  shorthand: boolean;
  computed: boolean;
  key: Expression;
  value: Expression;
  kind: 'init'; // ???
}

export interface ObjectExpression extends NodeImpl {
  type: 'ObjectExpression';
  properties: Array<Property>;
}

export interface ArrayExpression extends NodeImpl {
  type: 'ArrayExpression';
  elements: Array<Expression>;
}

export type Expression =
  Literal |
  Identifier |
  JSXElement |
  BinaryExpression |
  MemberExpression |
  ObjectExpression |
  ArrayExpression;

export interface ImportSpecifier extends NodeImpl {
  type: 'ImportSpecifier';
}

export interface ImportNamespaceSpecifier extends NodeImpl {
  type: 'ImportNamespaceSpecifier';
}

export interface ImportDefaultSpecifier extends NodeImpl {
  type: 'ImportDefaultSpecifier';
}

export interface ImportDeclaration extends NodeImpl {
  type: 'ImportDeclaration';
  specifiers: Array<ImportSpecifier | ImportNamespaceSpecifier | ImportDefaultSpecifier >;
  source: Literal;
}

export interface VariableDeclarator extends NodeImpl {
  type: 'VariableDeclarator';
  id: Identifier;
  init: Expression;
}

export interface VariableDeclaration extends NodeImpl {
  type: 'VariableDeclaration';
  declarations: Array<VariableDeclarator>;
  kind: 'const' | 'let';
}

export interface ExportNamedDeclaration extends NodeImpl {
  type: 'ExportNamedDeclaration';
  declaration: VariableDeclaration;
  specifiers: Array<never>; // TODO(jaked)
  source: null; // ???
}

export type Node = Program | ExpressionStatement | JSXElement;
