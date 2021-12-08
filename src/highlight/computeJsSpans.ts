import * as ESTree from '../estree';
import * as model from '../model';
import { Span, tokenType } from './types';

export function computeJsSpans(
  ast: ESTree.Node,
  interfaceMap: model.InterfaceMap | undefined,
  spans: Array<Span>
) {
  function span(
    ast: ESTree.Node,
    tokenType: tokenType,
    status?: string,
    link?: string,
    start?: number,
    end?: number,
  ) {
    const intf = interfaceMap && interfaceMap.get(ast);
    if (intf && intf.type === 'err') {
      status = intf.err.message;
    }
    start = start || ast.start;
    end = end || ast.end;
    spans.push({ start, end, tokenType, status, link });
  }

  function unknownFn(ast: ESTree.Node) {
    span(ast, 'default', `unexpected AST '${ast.type}'`);
  }

  function fn(ast: ESTree.Node) {
    switch (ast.type) {
      case 'Literal': {
        let tokenType;
        switch (typeof ast.value) {
          case 'string': tokenType = 'string'; break;
          case 'number': tokenType = 'number'; break;
          case 'boolean': tokenType = 'boolean'; break;
        }
        return span(ast, tokenType);
      }

      case 'JSXIdentifier':
      case 'Identifier':
        return span(ast, 'variable');

      case 'Property':
      {
        let status: string | undefined = undefined;
          if (ast.shorthand) {
            let intf = interfaceMap && interfaceMap.get(ast.value);
            if (intf && intf.type === 'err') {
              status = intf.err.message;
            }
          }
          span(ast.key, 'definition', status);
        }
        if (!ast.shorthand) {
          ESTree.visit(ast.value, fn, unknownFn);
        }
        return false;

      case 'JSXAttribute':
        span(ast.name, 'property');
        ESTree.visit(ast.value, fn, unknownFn);
        return false;

      case 'ObjectExpression':
        span(ast, 'default', undefined, undefined, ast.start, ast.start + 1);
        ESTree.visit(ast.properties, fn, unknownFn);
        span(ast, 'default', undefined, undefined, ast.end -1, ast.end);
        return false;

      case 'ObjectPattern': {
        span(ast, 'default', undefined, undefined, ast.start, ast.start + 1);
        ast.properties.forEach(prop => {
          span(prop.key, 'definition');
          if (!prop.shorthand) {
            ESTree.visit(prop.value, fn, unknownFn);
          }
        });
        const end = ast.typeAnnotation ? ast.typeAnnotation.start : ast.end;
        span(ast, 'default', undefined, undefined, end -1, end);
        ESTree.visit(ast.typeAnnotation, fn, unknownFn);
        return false;
      }

      case 'ArrayExpression':
        span(ast, 'default', undefined, undefined, ast.start, ast.start + 1);
        ESTree.visit(ast.elements, fn, unknownFn);
        span(ast, 'default', undefined, undefined, ast.end -1, ast.end);
        return false;

      case 'ArrowFunctionExpression':
        ast.params.forEach(param => {
          if (param.type === 'Identifier') {
            if (param.typeAnnotation) {
              const end = param.typeAnnotation.start;
              span(param, 'definition', undefined, undefined, param.start, end);
              ESTree.visit(param.typeAnnotation, fn, unknownFn);
            } else {
              span(param, 'definition');
            }
          } else {
            ESTree.visit(param, fn, unknownFn);
          }
        });
        ESTree.visit(ast.body, fn, unknownFn);
        return false;

      case 'ImportDeclaration':
        // TODO(jaked) handle `from`
        span(ast, 'keyword', undefined, undefined, ast.start, ast.start + 6); // import
        ESTree.visit(ast.specifiers, fn, unknownFn);
        // TODO(jaked) maybe a link doesn't make sense for a nonexistent note
        span(ast.source, 'link', undefined, ast.source.value);
        return false;

      case 'ImportSpecifier': {
        // TODO(jaked) handle `as`
        {
          let status: string | undefined = undefined;
          let intf = interfaceMap && interfaceMap.get(ast.imported);
          if (intf && intf.type === 'err') {
            status = intf.err.message;
          }
          span(ast.local, 'definition', status);
        }
        if (ast.imported.start !== ast.local.start) {
          span(ast.imported, 'variable');
        }
        return false;
      }

      case 'ImportNamespaceSpecifier':
        // TODO(jaked) handle `as`
        span(ast, 'variable', undefined, undefined, ast.start, ast.start + 1); // *
        span(ast.local, 'definition');
        return false;

      case 'ImportDefaultSpecifier': {
        span(ast.local, 'definition');
        return false;
      }

      case 'ExportNamedDeclaration':
        return span(ast, 'keyword', undefined, undefined, ast.start, ast.start + 6); // export

      case 'ExportDefaultDeclaration':
        // TODO(jaked)
        // if you stick a comment between `export` and `default`
        // the whole thing is rendered as a keyword
        return span(ast, 'keyword', undefined, undefined, ast.start, ast.declaration.start);

      case 'VariableDeclaration':
        return span(ast, 'keyword', undefined, undefined, ast.start, ast.start + ast.kind.length);

      case 'VariableDeclarator':
        {
          span(ast.id, 'definition', undefined, undefined, ast.id.start, ast.id.start + ast.id.name.length);
          ESTree.visit(ast.id.typeAnnotation, fn, unknownFn);
        }
        ESTree.visit(ast.init, fn, unknownFn);
        return false;

      case 'TSTypeLiteral':
        span(ast, 'default', undefined, undefined, ast.start, ast.start + 1);
        ESTree.visit(ast.members, fn, unknownFn);
        span(ast, 'default', undefined, undefined, ast.end - 1, ast.end);
        return false;

      case 'TSPropertySignature':
        span(ast.key, 'definition');
        ESTree.visit(ast.typeAnnotation, fn, unknownFn);
        return false;

      case 'TSTypeReference':
        span(ast.typeName, 'variable');
        ESTree.visit(ast.typeParameters, fn, unknownFn);
        return false;

      case 'TSBooleanKeyword':
      case 'TSNumberKeyword':
      case 'TSStringKeyword':
      case 'TSNullKeyword':
      case 'TSUndefinedKeyword':
        return span(ast, 'variable');

      case 'BlockStatement':
        // TODO(jaked) how to render nested errors?
        span(ast, 'default', undefined, undefined, ast.start, ast.start + 1);
        ESTree.visit(ast.body, fn, unknownFn);
        span(ast, 'default', undefined, undefined, ast.end - 1, ast.end);
        return false;

      default:
        // can't handle unknown nodes with catch-all
        // because some known nodes rely on normal visitor behavior
        // TODO(jaked) needs a rethink
    }
  }

  ESTree.visit(ast, fn, unknownFn);
}
