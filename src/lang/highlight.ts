import * as ESTree from '../lang/ESTree';
import * as model from '../model';

export type tag =
  'default' | 'atom' | 'number' | 'string' | 'keyword' |
  'definition' | 'variable' | 'property' | 'link';

export type Span = {
  start: number,
  end: number,
  tag: tag,
  status?: string,
  link?: string,
};

export function computeJsSpans(
  ast: ESTree.Node,
  interfaceMap: model.InterfaceMap | undefined,
  spans: Array<Span>
) {
  function span(
    ast: ESTree.Node,
    tag: tag,
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
    spans.push({ start, end, tag, status, link });
  }

  function fn(ast: ESTree.Node) {
    switch (ast.type) {
      case 'Literal': {
        let tag;
        switch (typeof ast.value) {
          case 'string': tag = 'string'; break;
          case 'number': tag = 'number'; break;
          case 'boolean': tag = 'atom'; break;
          case 'object': tag = 'atom'; break;
        }
        return span(ast, tag);
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
          ESTree.visit(ast.value, fn);
        }
        return false;

      case 'JSXAttribute':
        span(ast.name, 'property');
        ESTree.visit(ast.value, fn);
        return false;

      case 'ObjectExpression':
        span(ast, 'default', undefined, undefined, ast.start, ast.start + 1);
        ESTree.visit(ast.properties, fn);
        span(ast, 'default', undefined, undefined, ast.end -1, ast.end);
        return false;

      case 'ObjectPattern': {
        span(ast, 'default', undefined, undefined, ast.start, ast.start + 1);
        ast.properties.forEach(prop => {
          span(prop.key, 'definition');
          if (!prop.shorthand) {
            ESTree.visit(prop.value, fn);
          }
        });
        const end = ast.typeAnnotation ? ast.typeAnnotation.start : ast.end;
        span(ast, 'default', undefined, undefined, end -1, end);
        ESTree.visit(ast.typeAnnotation, fn);
        return false;
      }

      case 'ArrayExpression':
        span(ast, 'default', undefined, undefined, ast.start, ast.start + 1);
        ESTree.visit(ast.elements, fn);
        span(ast, 'default', undefined, undefined, ast.end -1, ast.end);
        return false;

      case 'ArrowFunctionExpression':
        ast.params.forEach(param => {
          if (param.type === 'Identifier') {
            if (param.typeAnnotation) {
              const end = param.typeAnnotation.start;
              span(param, 'definition', undefined, undefined, param.start, end);
              ESTree.visit(param.typeAnnotation, fn);
            } else {
              span(param, 'definition');
            }
          } else {
            ESTree.visit(param, fn);
          }
        });
        ESTree.visit(ast.body, fn);
        return false;

      case 'ImportDeclaration':
        // TODO(jaked) handle `from`
        span(ast, 'keyword', undefined, undefined, ast.start, ast.start + 6); // import
        ESTree.visit(ast.specifiers, fn);
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
          ESTree.visit(ast.id.typeAnnotation, fn);
        }
        ESTree.visit(ast.init, fn);
        return false;

      case 'TSTypeLiteral':
        span(ast, 'default', undefined, undefined, ast.start, ast.start + 1);
        ESTree.visit(ast.members, fn);
        span(ast, 'default', undefined, undefined, ast.end - 1, ast.end);
        return false;

      case 'TSPropertySignature':
        span(ast.key, 'definition');
        ESTree.visit(ast.typeAnnotation, fn);
        return false;

      case 'TSTypeReference':
        span(ast.typeName, 'variable');
        ESTree.visit(ast.typeParameters, fn);
        return false;

      case 'TSBooleanKeyword':
      case 'TSNumberKeyword':
      case 'TSStringKeyword':
      case 'TSNullKeyword':
      case 'TSUndefinedKeyword':
        span(ast, 'variable');
    }
  }
  ESTree.visit(ast, fn);
}
