// See
//  https://github.com/acornjs/acorn
//  https://github.com/RReverser/acorn-jsx

import * as Type from './Type';

interface NodeImpl {
  type: string;
  start: number;
  end: number;

  // set in typechecking
  etype?: Type.Type;
  atom?: boolean;
}

export interface Program extends NodeImpl {
  type: 'Program';
  body: Array<ExpressionStatement | ImportDeclaration | ExportNamedDeclaration | VariableDeclaration >;
  sourceType: 'module';
}

export interface ExpressionStatement extends NodeImpl {
  type: 'ExpressionStatement';
  expression: JSXElement;
}

export interface JSXFragment extends NodeImpl {
  type: 'JSXFragment';
  children: Array<JSXElement | JSXText | JSXExpressionContainer >;
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
  name: JSXIdentifier;
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

export interface ArrowFunctionExpression extends NodeImpl {
  type: 'ArrowFunctionExpression';
  params: Array<Identifier>;
  body: Expression;
}

export type Expression =
  Literal |
  Identifier |
  JSXText |
  JSXExpressionContainer |
  JSXFragment |
  JSXElement |
  BinaryExpression |
  MemberExpression |
  ObjectExpression |
  ArrayExpression |
  ArrowFunctionExpression;

// import { Foo as Bar }
export interface ImportSpecifier extends NodeImpl {
  type: 'ImportSpecifier';
  imported: Identifier;
  local: Identifier;
}

// import * as Bar
export interface ImportNamespaceSpecifier extends NodeImpl {
  type: 'ImportNamespaceSpecifier';
  local: Identifier;
}

// import Bar
export interface ImportDefaultSpecifier extends NodeImpl {
  type: 'ImportDefaultSpecifier';
  local: Identifier;
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

export type Node =
  Program | ExpressionStatement |
  JSXFragment | JSXText | JSXElement | JSXOpeningElement |
  JSXClosingElement | JSXAttribute | JSXIdentifier | JSXExpressionContainer |
  Literal | Identifier | BinaryExpression | MemberExpression | Property |
  ObjectExpression | ArrayExpression | ArrowFunctionExpression |
  ImportSpecifier | ImportNamespaceSpecifier | ImportDefaultSpecifier | ImportDeclaration |
  VariableDeclarator | VariableDeclaration | ExportNamedDeclaration;

// if fn returns false, don't recurse into children
// (caller must visit children itself if needed)
export function visit(
  ast: Node | Array<Node> | null,
  fn: (n: Node) => (void | false)
) {
  // wheee Javascript
  if (ast === null) return;
  if (Array.isArray(ast)) {
    return ast.forEach(node => visit(node, fn));
  }
  if (fn(ast) === false) return;
  switch (ast.type) {
    case 'Program':
      return visit(ast.body, fn);

    case 'ExpressionStatement':
      return visit(ast.expression, fn);

    case 'JSXFragment':
      return visit(ast.children, fn);

    case 'JSXText':
      return;

    case 'JSXElement':
      visit(ast.openingElement, fn);
      visit(ast.children, fn);
      return visit(ast.closingElement, fn);

    case 'JSXOpeningElement':
      visit(ast.name, fn);
      return visit(ast.attributes, fn);

    case 'JSXClosingElement':
      return visit(ast.name, fn);

    case 'JSXAttribute':
      visit(ast.name, fn);
      return visit(ast.value, fn);

    case 'JSXIdentifier':
      return;

    case 'JSXExpressionContainer':
      return visit(ast.expression, fn);

    case 'Literal':
      return;

    case 'Identifier':
      return;

    case 'BinaryExpression':
      visit(ast.left, fn);
      return visit(ast.right, fn);

    case 'MemberExpression':
      visit(ast.object, fn);
      return visit(ast.property, fn);

    case 'Property':
      visit(ast.key, fn);
      return visit(ast.value, fn);

    case 'ObjectExpression':
      return visit(ast.properties, fn);

    case 'ArrayExpression':
      return visit(ast.elements, fn);

    case 'ArrowFunctionExpression':
      visit(ast.params, fn);
      return visit(ast.body, fn);

    case 'ImportSpecifier':
      visit(ast.imported, fn);
      return visit(ast.local, fn);

    case 'ImportNamespaceSpecifier':
      return visit(ast.local, fn);

    case 'ImportDefaultSpecifier':
      return visit(ast.local, fn);

    case 'ImportDeclaration':
      visit(ast.specifiers, fn);
      return visit(ast.source, fn);

    case 'VariableDeclarator':
      visit(ast.id, fn);
      return visit(ast.init, fn);

    case 'VariableDeclaration':
      return visit(ast.declarations, fn);

    case 'ExportNamedDeclaration':
      return visit(ast.declaration, fn);

    default:
      throw new Error('unexpected AST ' + (ast as Node).type);
  }
}
