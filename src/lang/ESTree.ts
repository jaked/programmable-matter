// See
//  https://github.com/acornjs/acorn
//  https://github.com/RReverser/acorn-jsx

import * as Immutable from 'immutable';

interface NodeImpl {
  type: string;
  start: number;
  end: number;
}

export interface Program extends NodeImpl {
  type: 'Program';
  body: Array<ExpressionStatement | ImportDeclaration | ExportNamedDeclaration | ExportDefaultDeclaration | VariableDeclaration >;
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
  value: null | JSXExpressionContainer | Literal;
}

export interface JSXIdentifier extends NodeImpl {
  type: 'JSXIdentifier';
  name: string;
}

export interface JSXExpressionContainer extends NodeImpl {
  type: 'JSXExpressionContainer';
  expression: Expression;
}

export interface JSXEmptyExpression extends NodeImpl {
  type: 'JSXEmptyExpression';
}

export interface Literal extends NodeImpl {
  type: 'Literal';
  value: any;
}

export interface Identifier extends NodeImpl {
  type: 'Identifier';
  name: string;
  typeAnnotation?: TSTypeAnnotation;
}

export interface UnaryExpression extends NodeImpl {
  type: 'UnaryExpression';
  operator: '!' | 'typeof';
  prefix: boolean;
  argument: Expression;
}

export interface BinaryExpression extends NodeImpl {
  type: 'BinaryExpression';
  left: Expression;
  operator:
    '+' | '-' | '*' | '/' | '**' | '%' |
    '==' | '!=' | '===' | '!==' |
    '<' | '<=' | '>' | '>=' |
    '|' | '&' | '^' | '<<' | '>>' | '>>>';
  right: Expression;
}

export interface LogicalExpression extends NodeImpl {
  type: 'LogicalExpression';
  left: Expression;
  operator: '||' | '&&';
  right: Expression;
}

export interface SequenceExpression extends NodeImpl {
  type: 'SequenceExpression';
  expressions: Expression[];
}

export interface MemberExpression extends NodeImpl {
  type: 'MemberExpression';
  object: Expression;
  property: Expression;
  computed: boolean;
}

export interface CallExpression extends NodeImpl {
  type: 'CallExpression';
  callee: Expression;
  arguments: Array<Expression>;
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
  params: Array<Pattern & { typeAnnotation?: TSTypeAnnotation }>;
  body: Expression;
}

export interface ConditionalExpression extends NodeImpl {
  type: 'ConditionalExpression';
  test: Expression;
  consequent: Expression;
  alternate: Expression;
}

export interface TemplateElement extends NodeImpl {
  type: "TemplateElement";
  value: { raw: string, cooked?: string };
  tail: boolean;
}

export interface TemplateLiteral extends NodeImpl {
  type: "TemplateLiteral";
  quasis: Array<TemplateElement>;
  expressions: Array<Expression>;
}

export interface TSAsExpression extends NodeImpl {
  type: "TSAsExpression";
  expression: Expression;
  typeAnnotation: TypeAnnotation;
}

export type Expression =
  Literal |
  Identifier |
  JSXIdentifier |
  JSXText |
  JSXExpressionContainer |
  JSXEmptyExpression |
  JSXFragment |
  JSXElement |
  JSXOpeningElement |
  JSXClosingElement |
  JSXAttribute |
  UnaryExpression |
  LogicalExpression |
  BinaryExpression |
  SequenceExpression |
  MemberExpression |
  CallExpression |
  ObjectExpression |
  Property |
  ArrayExpression |
  ArrowFunctionExpression |
  ConditionalExpression |
  TemplateLiteral |
  TemplateElement |
  TSAsExpression;

export interface TSNeverKeyword extends NodeImpl {
  type: 'TSNeverKeyword';
}

export interface TSUnknownKeyword extends NodeImpl {
  type: 'TSUnknownKeyword';
}

export interface TSBooleanKeyword extends NodeImpl {
  type: 'TSBooleanKeyword';
}

export interface TSNumberKeyword extends NodeImpl {
  type: 'TSNumberKeyword';
}

export interface TSStringKeyword extends NodeImpl {
  type: 'TSStringKeyword';
}

export interface TSNullKeyword extends NodeImpl {
  type: 'TSNullKeyword';
}

export interface TSUndefinedKeyword extends NodeImpl {
  type: 'TSUndefinedKeyword';
}

export interface TSArrayType extends NodeImpl {
  type: 'TSArrayType';
  elementType: TypeAnnotation;
}

export interface TSTupleType extends NodeImpl {
  type: 'TSTupleType';
  elementTypes: TypeAnnotation[];
}

export interface TSTypeLiteral extends NodeImpl {
  type: 'TSTypeLiteral';
  members: TSPropertySignature[];
}

export interface TSPropertySignature extends NodeImpl {
  type: 'TSPropertySignature';
  key: Identifier;
  typeAnnotation: TSTypeAnnotation;
}

export interface TSLiteralType extends NodeImpl {
  type: 'TSLiteralType';
  literal: Literal;
}

export interface TSUnionType extends NodeImpl {
  type: 'TSUnionType';
  types: TypeAnnotation[];
}

export interface TSIntersectionType extends NodeImpl {
  type: 'TSIntersectionType';
  types: TypeAnnotation[];
}

export interface TSTypeReference extends NodeImpl {
  type: 'TSTypeReference';
  typeName: QualifiedIdentifier;
  typeParameters?: TSTypeParameterInstantiation;
}

export interface TSQualifiedName extends NodeImpl {
  type: 'TSQualifiedName';
  left: QualifiedIdentifier;
  right: QualifiedIdentifier;
}

export interface TSTypeParameterInstantiation extends NodeImpl {
  type: 'TSTypeParameterInstantiation';
  params: TypeAnnotation[];
}

export interface TSFunctionType extends NodeImpl {
  type: 'TSFunctionType';
  parameters: Array<Identifier & { typeAnnotation: TSTypeAnnotation }>;
  typeAnnotation: TSTypeAnnotation;
}

export interface TSParenthesizedType extends NodeImpl {
  type: 'TSParenthesizedType';
  typeAnnotation: TypeAnnotation;
}

export type QualifiedIdentifier =
  Identifier | TSQualifiedName;

export type TypeAnnotation =
  TSBooleanKeyword | TSNumberKeyword | TSStringKeyword | TSNullKeyword | TSUndefinedKeyword |
  TSArrayType | TSTupleType | TSTypeLiteral | TSLiteralType |
  TSUnionType | TSIntersectionType | TSFunctionType |
  TSTypeReference | TSNeverKeyword | TSUnknownKeyword | TSParenthesizedType;

export interface TSTypeAnnotation extends NodeImpl {
  type: 'TSTypeAnnotation';
  typeAnnotation: TypeAnnotation;
}

// ESTree puts Property in ObjectPattern
// we give it a different type to restrict the key / value types
export interface PropertyPattern extends NodeImpl {
  type: 'Property';
  key: Identifier;
  value: Pattern;
  shorthand: boolean;
}

export interface ObjectPattern extends NodeImpl {
  type: 'ObjectPattern';
  properties: Array<PropertyPattern>;
  typeAnnotation?: TSTypeAnnotation;
}

export type Pattern =
  Identifier |
  ObjectPattern |
  PropertyPattern;

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

export interface ExportDefaultDeclaration extends NodeImpl {
  type: 'ExportDefaultDeclaration';
  declaration: Expression;
}

export type Node =
  Program | ExpressionStatement | Expression | Pattern |
  ImportSpecifier | ImportNamespaceSpecifier | ImportDefaultSpecifier | ImportDeclaration |
  VariableDeclarator | VariableDeclaration | ExportNamedDeclaration | ExportDefaultDeclaration |
  TSTypeAnnotation | TSPropertySignature | TSQualifiedName | TSTypeParameterInstantiation | TypeAnnotation;

// if fn returns false, don't recurse into children
// (caller must visit children itself if needed)
export function visit(
  ast: Node | Array<Node> | null | undefined,
  fn: (n: Node) => (void | false)
) {
  if (ast === null || ast === undefined) return;
  if (Array.isArray(ast)) {
    return ast.forEach(node => visit(node, fn));
  }
  if (fn(ast) === false) return;
  switch (ast.type) {
    case 'Program':
      return visit(ast.body, fn);

    case 'ExpressionStatement':
      return visit(ast.expression, fn);

    case 'JSXEmptyExpression':
      return;

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
      if (ast.value) visit(ast.value, fn);
      return;

    case 'JSXIdentifier':
      return;

    case 'JSXExpressionContainer':
      return visit(ast.expression, fn);

    case 'Literal':
      return;

    case 'Identifier':
      if (ast.typeAnnotation) return visit(ast.typeAnnotation, fn);
      else return;

    case 'UnaryExpression':
      return visit(ast.argument, fn);

    case 'BinaryExpression':
      visit(ast.left, fn);
      return visit(ast.right, fn);

    case 'LogicalExpression':
      visit(ast.left, fn);
      return visit(ast.right, fn);

    case 'SequenceExpression':
      return visit(ast.expressions, fn);

    case 'MemberExpression':
      visit(ast.object, fn);
      return visit(ast.property, fn);

    case 'CallExpression':
      visit(ast.callee, fn);
      return visit(ast.arguments, fn);

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

    case 'ConditionalExpression':
      visit(ast.test, fn);
      visit(ast.consequent, fn);
      return visit(ast.alternate, fn);

    case 'TemplateElement':
      return;

    case 'TemplateLiteral':
      return visit(ast.quasis, fn);

    case 'ObjectPattern':
      visit(ast.properties, fn);
      if (ast.typeAnnotation) return visit(ast.typeAnnotation, fn);
      else return;

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

    case 'ExportDefaultDeclaration':
      return visit(ast.declaration, fn);

    case 'TSTypeAnnotation':
      return visit(ast.typeAnnotation, fn);

    case 'TSBooleanKeyword':
    case 'TSNumberKeyword':
    case 'TSStringKeyword':
    case 'TSNullKeyword':
    case 'TSUndefinedKeyword':
      return;

    case 'TSArrayType':
      return visit(ast.elementType, fn);

    case 'TSTupleType':
      return visit(ast.elementTypes, fn);

    case 'TSTypeLiteral':
      return visit(ast.members, fn);

    case 'TSLiteralType':
      return visit(ast.literal, fn);

    case 'TSUnionType':
      return visit(ast.types, fn);

    case 'TSIntersectionType':
      return visit(ast.types, fn);

    case 'TSFunctionType':
      visit(ast.parameters, fn);
      return visit(ast.typeAnnotation, fn);

    case 'TSTypeReference':
      visit(ast.typeName, fn);
      return visit(ast.typeParameters, fn);

    case 'TSQualifiedName':
      visit(ast.left, fn);
      return visit(ast.right, fn);

      case 'TSTypeParameterInstantiation':
      return visit(ast.params, fn);

    case 'TSNeverKeyword':
    case 'TSUnknownKeyword':
      return;

    case 'TSParenthesizedType':
      return visit(ast.typeAnnotation, fn);

    case 'TSPropertySignature':
      visit(ast.key, fn);
      return visit(ast.typeAnnotation, fn);

    default:
      const err = new Error('unexpected AST ' + (ast as Node).type);
      console.log(err);
      throw err;
  }
}

export function freeIdentifiers(expr: Expression): Array<string> {
  const free: Array<string> = [];

  function fn(
    expr: Expression,
    bound: Immutable.Set<string>,
  ) {
    visit(expr, node => {
      switch (node.type) {
        case 'Identifier': {
          const id = node.name;
          if (!bound.contains(id) && !free.includes(id))
            free.push(id);
          break;
        }

        case 'JSXIdentifier': {
          const id = node.name;
          if (!bound.contains(id) && !free.includes(id))
            free.push(id);
          break;
        }

        case 'ObjectExpression': {
          node.properties.forEach(prop => {
            // keys are not identifier references, skip them
            fn(prop.value, bound);
          });
          return false;
        }

        case 'JSXOpeningElement': {
          fn(node.name, bound);
          node.attributes.forEach(attr =>  {
            // keys are not identifier references, skip them
            if (attr.value) fn(attr.value, bound);
          });
          return false;
        }

        case 'ArrowFunctionExpression':
          node.params.forEach(pat => {
            switch (pat.type) {
              case 'Identifier':
                bound = bound.add(pat.name);
                break;

              case 'ObjectPattern':
                pat.properties.forEach(pat => {
                  if (pat.key.type === 'Identifier') {
                    bound = bound.add(pat.key.name);
                  } else {
                    throw new Error ('expected Identifier');
                  }
                });
                break;

              default: throw new Error('unexpected AST ' + (pat as Pattern).type)
            }
          });
          fn(node.body, bound);
          return false;

        case 'MemberExpression':
          fn(node.object, bound);
          if (node.computed) {
            fn(node.property, bound);
          }
          return false;
      }
    });
  }
  fn(expr, Immutable.Set());
  return free;
}