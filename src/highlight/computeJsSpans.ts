import * as ESTree from '../estree';
import * as model from '../model';
import { Span, tokenType } from './types';

export function computeJsSpans(
  ast: ESTree.Node,
  interfaceMap: model.InterfaceMap,
  spans: Array<Span>
) {
  function span(ast: ESTree.Node, props : {
    tokenType?: tokenType,
    start?: number,
    end?: number,
    status?: string,
    link?: string,
  } = {}) {
    const span: Span = {
      start: props.start ?? ast.start,
      end: props.end ?? ast.end,
      tokenType: props.tokenType ?? 'default'
    }
    if ('status' in props) span.status = props.status;
    if ('link' in props) span.link = props.link;
    spans.push(span);
  }

  function v(
    ast: ESTree.Node | Array<ESTree.Node> | null | undefined,
    tokenType?: tokenType
  ) {
    if (ast === null || ast === undefined) return;
    if (Array.isArray(ast)) return ast.forEach(n => v(n, tokenType));

    const intf = interfaceMap.get(ast);
    if (intf && intf.type === 'err') {
      // TODO(jaked) separate error and syntax spans?
      if (ast.type === 'Identifier')
        // don't show error on type ascription, just identifier
        span(ast, { status: intf.err.message, end: ast.start + ast.name.length });
      else
        span(ast, { status: intf.err.message });
    }

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
        v(ast.name, 'property');
        return v(ast.value);

      case 'JSXIdentifier':
        return span(ast, { tokenType: tokenType ?? 'variable' });

      case 'JSXExpressionContainer':
        return v(ast.expression);

      case 'Literal': {
        let tokenType;
        switch (typeof ast.value) {
          case 'string': tokenType = 'string'; break;
          case 'number': tokenType = 'number'; break;
          case 'boolean': tokenType = 'boolean'; break;
        }
        return span(ast, { tokenType });
      }

      case 'Identifier':
        span(ast, { tokenType: tokenType ?? 'variable', end: ast.start + ast.name.length });
        return v(ast.typeAnnotation);

      case 'UnaryExpression':
        return v(ast.argument);

      case 'BinaryExpression':
        v(ast.left, tokenType);
        return v(ast.right);

      case 'LogicalExpression':
        v(ast.left, tokenType);
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
        if (ast.shorthand) {
          const intf = interfaceMap.get(ast.value);
          if (intf && intf.type === 'err')
            span(ast, { status: intf.err.message })
          return v(ast.key, 'definition');
        } else {
          v(ast.key, 'definition');
          return v(ast.value);
        }

      case 'ObjectExpression':
        return v(ast.properties);

      case 'ArrayExpression':
        return v(ast.elements);

      case 'ArrowFunctionExpression':
        v(ast.params, 'definition');
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
        // TODO(jaked) handle `as`
        // TODO(jaked) highlight imported as 'variable' if different from local
        v(ast.imported);
        return v(ast.local, 'definition');

      case 'ImportNamespaceSpecifier':
        // TODO(jaked) handle `as`
        span(ast, { tokenType: 'variable', end: ast.start + 1 }); // *
        return v(ast.local, 'definition');

      case 'ImportDefaultSpecifier':
        return v(ast.local, 'definition');

      case 'ImportDeclaration':
        // TODO(jaked) handle `from`
        span(ast, { tokenType: 'keyword', end: ast.start + 6 }); // import
        v(ast.specifiers);
        // TODO(jaked) maybe a link doesn't make sense for a nonexistent note
        return v(ast.source, 'link');

      case 'VariableDeclarator':
        v(ast.id, 'definition');
        return v(ast.init);

      case 'VariableDeclaration':
        span(ast, { tokenType: 'keyword', end: ast.start + ast.kind.length });
        return v(ast.declarations);

      case 'ExportNamedDeclaration':
        span(ast, { tokenType: 'keyword', end: ast.start + 6 }); // export
        return v(ast.declaration);

      case 'ExportDefaultDeclaration':
        // TODO(jaked)
        // if you stick a comment between `export` and `default`
        // the whole thing is rendered as a keyword
        span(ast, { tokenType: 'keyword', end: ast.declaration.start });
        return v(ast.declaration);

      case 'TSTypeAnnotation':
        return v(ast.typeAnnotation);

      case 'TSBooleanKeyword':
      case 'TSNumberKeyword':
      case 'TSStringKeyword':
      case 'TSNullKeyword':
      case 'TSUndefinedKeyword':
        span(ast, { tokenType: 'variable' });
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
        v(ast.left, tokenType);
        return v(ast.right, tokenType);

      case 'TSTypeParameterInstantiation':
        return v(ast.params, tokenType);

      case 'TSNeverKeyword':
      case 'TSUnknownKeyword':
        return;

      case 'TSParenthesizedType':
        return v(ast.typeAnnotation);

      case 'TSPropertySignature':
        v(ast.key, 'property');
        return v(ast.typeAnnotation);

      default:
        span(ast, { tokenType: 'default', status: `unexpected AST '${(ast as ESTree.Node).type}'` });
    }
  }

  v(ast);
}
