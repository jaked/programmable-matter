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
  body: Array<ExpressionStatement | ImportDeclaration | ExportNamedDeclaration | ExportDefaultDeclaration | VariableDeclaration | BlockStatement>;
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
  operator: '+' | '-' | '!' | 'typeof';
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
  operator: '||' | '&&' | '??';
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
  body: Expression | BlockStatement;
}

export interface BlockStatement extends NodeImpl {
  type: 'BlockStatement';
  body: Array<Statement>;
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


export interface AssignmentExpression extends NodeImpl {
  type: "AssignmentExpression";
  left: Expression;
  right: Expression;
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
  TSAsExpression |
  AssignmentExpression;

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
  ObjectPattern;

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

export type Statement =
  ExpressionStatement | VariableDeclaration | BlockStatement;

export type Node =
  Program | Statement | Expression | Pattern | PropertyPattern |
  ImportSpecifier | ImportNamespaceSpecifier | ImportDefaultSpecifier | ImportDeclaration |
  VariableDeclarator | ExportNamedDeclaration | ExportDefaultDeclaration |
  TSTypeAnnotation | TSPropertySignature | TSQualifiedName | TSTypeParameterInstantiation | TypeAnnotation;

// if fn returns false, don't recurse into children
// (caller must visit children itself if needed)
export function visit(
  ast: Node | Array<Node> | null | undefined,
  fn: (n: Node) => (void | false),
  unknownFn?: (n: Node) => void,
) {
  function v(ast: Node | Array<Node> | null | undefined) {
    if (ast === null || ast === undefined) return;
    if (Array.isArray(ast)) {
      return ast.forEach(v);
    }
    if (fn(ast) === false) return;
    switch (ast.type) {
      case 'Program':
        return v(ast.body);

      case 'ExpressionStatement':
        return v(ast.expression);

      case 'JSXEmptyExpression':
        return;

      case 'JSXFragment':
        return v(ast.children);

      case 'JSXText':
        return;

      case 'JSXElement':
        v(ast.openingElement);
        v(ast.children);
        return v(ast.closingElement);

      case 'JSXOpeningElement':
        v(ast.name);
        return v(ast.attributes);

      case 'JSXClosingElement':
        return v(ast.name);

      case 'JSXAttribute':
        v(ast.name);
        v(ast.value);
        return;

      case 'JSXIdentifier':
        return;

      case 'JSXExpressionContainer':
        return v(ast.expression);

      case 'Literal':
        return;

      case 'Identifier':
        return v(ast.typeAnnotation);

      case 'UnaryExpression':
        return v(ast.argument);

      case 'BinaryExpression':
        v(ast.left);
        return v(ast.right);

      case 'LogicalExpression':
        v(ast.left);
        return v(ast.right);

      case 'SequenceExpression':
        return v(ast.expressions);

      case 'MemberExpression':
        v(ast.object);
        return v(ast.property);

      case 'CallExpression':
        v(ast.callee);
        return v(ast.arguments);

      case 'Property':
        v(ast.key);
        return v(ast.value);

      case 'ObjectExpression':
        return v(ast.properties);

      case 'ArrayExpression':
        return v(ast.elements);

      case 'ArrowFunctionExpression':
        v(ast.params);
        return v(ast.body);

      case 'BlockStatement':
        return v(ast.body);

      case 'ConditionalExpression':
        v(ast.test);
        v(ast.consequent);
        return v(ast.alternate);

      case 'TemplateElement':
        return;

      case 'TemplateLiteral':
        return v(ast.quasis);

      case 'AssignmentExpression':
        v(ast.left);
        return v(ast.right);

      case 'TSAsExpression':
        v(ast.expression);
        return v(ast.typeAnnotation);

      case 'ObjectPattern':
        v(ast.properties);
        return v(ast.typeAnnotation);

      case 'ImportSpecifier':
        v(ast.imported);
        return v(ast.local);

      case 'ImportNamespaceSpecifier':
        return v(ast.local);

      case 'ImportDefaultSpecifier':
        return v(ast.local);

      case 'ImportDeclaration':
        v(ast.specifiers);
        return v(ast.source);

      case 'VariableDeclarator':
        v(ast.id);
        return v(ast.init);

      case 'VariableDeclaration':
        return v(ast.declarations);

      case 'ExportNamedDeclaration':
        return v(ast.declaration);

      case 'ExportDefaultDeclaration':
        return v(ast.declaration);

      case 'TSTypeAnnotation':
        return v(ast.typeAnnotation);

      case 'TSBooleanKeyword':
      case 'TSNumberKeyword':
      case 'TSStringKeyword':
      case 'TSNullKeyword':
      case 'TSUndefinedKeyword':
        return;

      case 'TSArrayType':
        return v(ast.elementType);

      case 'TSTupleType':
        return v(ast.elementTypes);

      case 'TSTypeLiteral':
        return v(ast.members);

      case 'TSLiteralType':
        return v(ast.literal);

      case 'TSUnionType':
        return v(ast.types);

      case 'TSIntersectionType':
        return v(ast.types);

      case 'TSFunctionType':
        v(ast.parameters);
        return v(ast.typeAnnotation);

      case 'TSTypeReference':
        v(ast.typeName);
        return v(ast.typeParameters);

      case 'TSQualifiedName':
        v(ast.left);
        return v(ast.right);

      case 'TSTypeParameterInstantiation':
        return v(ast.params);

      case 'TSNeverKeyword':
      case 'TSUnknownKeyword':
        return;

      case 'TSParenthesizedType':
        return v(ast.typeAnnotation);

      case 'TSPropertySignature':
        v(ast.key);
        return v(ast.typeAnnotation);

      default:
        if (unknownFn) {
          unknownFn(ast);
        } else {
          const err = new Error(`unexpected AST '${(ast as Node).type}'`);
          console.log(err);
          throw err;
        }
    }
  }
  v(ast);
}

const STARTS_WITH_CAPITAL_LETTER = /^[A-Z]/

export function freeIdentifiers(expr: Node): Array<Identifier | JSXIdentifier> {
  const free: Array<Identifier | JSXIdentifier> = [];

  function fn(
    expr: Node,
    bound: Immutable.Set<Identifier | JSXIdentifier>,
  ) {
    visit(expr, node => {
      switch (node.type) {
        case 'Identifier': {
          if (!bound.contains(node) && !free.includes(node))
            free.push(node);
          break;
        }

        case 'JSXIdentifier': {
          if (!bound.contains(node) && !free.includes(node))
            free.push(node);
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
          // lowercase tags are passed through as strings
          if (STARTS_WITH_CAPITAL_LETTER.test(node.name.name))
            fn(node.name, bound);
          node.attributes.forEach(attr =>  {
            // keys are not identifier references, skip them
            if (attr.value) fn(attr.value, bound);
          });
          return false;
        }

        case 'JSXClosingElement':
          // tag is handled in JSXOpeningElement
          return false;

        case 'ArrowFunctionExpression':
          node.params.forEach(pat => {
            switch (pat.type) {
              case 'Identifier':
                bound = bound.add(pat);
                break;

              case 'ObjectPattern':
                pat.properties.forEach(pat => {
                  if (pat.key.type === 'Identifier') {
                    bound = bound.add(pat.key);
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