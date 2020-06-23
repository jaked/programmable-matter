import * as React from 'react';
import Try from '../util/Try';
import * as MDXHAST from '../lang/mdxhast';
import * as ESTree from '../lang/ESTree';
import * as data from '../data';

export type component = React.FunctionComponent<{}>;

export type components = {
  default: component,
  atom: component,
  number: component,
  string: component,
  keyword: component,
  definition: component,
  variable: component,
  property: component,
  link: component,
}

type Span = {
  start: number,
  end: number,
  component: keyof components,
  status?: string,
  link?: string,
};

function computeJsSpans(
  okComponents: components,
  errComponents: components,
  ast: ESTree.Node,
  annots: data.AstAnnotations | undefined,
  spans: Array<Span>
) {
  function span(
    ast: ESTree.Node,
    component: keyof components,
    status?: string,
    link?: string,
    start?: number,
    end?: number,
  ) {
    const type = annots && annots.get(ast);
    if (type && type.kind === 'Error') {
      status = type.err.message;
    }
    start = start || ast.start;
    end = end || ast.end;
    spans.push({ start, end, component, status, link });
  }

  function fn(ast: ESTree.Node) {
    switch (ast.type) {
      case 'Literal': {
        let component;
        switch (typeof ast.value) {
          case 'string': component = 'string'; break;
          case 'number': component = 'number'; break;
          case 'boolean': component = 'atom'; break;
          case 'object': component = 'atom'; break;
        }
        return span(ast, component);
      }

      case 'JSXIdentifier':
      case 'Identifier':
        return span(ast, 'variable');

      case 'Property':
      {
        let status: string | undefined = undefined;
          if (ast.shorthand) {
            let type = annots && annots.get(ast.value);
            if (type && type.kind === 'Error') {
              status = type.err.message;
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
          let type = annots && annots.get(ast.imported);
          if (type && type.kind === 'Error') {
            status = type.err.message;
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
          // TODO(jaked) clean up duplication
          let components = okComponents;
          let status: string | undefined = undefined;
          let type = annots && annots.get(ast.id);
          if (type && type.kind === 'Error') {
            components = errComponents;
            status = type.err.message;
          }
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

function computeSpans(
  okComponents: components,
  errComponents: components,
  ast: MDXHAST.Node,
  annots: data.AstAnnotations | undefined,
  spans: Array<Span>
) {
  switch (ast.type) {
    case 'root':
    case 'element':
      return ast.children.forEach(child =>
        computeSpans(okComponents, errComponents, child, annots, spans)
      );

    case 'text':
      return;

    case 'jsx':
      if (!ast.jsxElement) throw new Error('expected JSX node to be parsed');
      // TODO(jaked)
      // parsing should always succeed with some AST
      return ast.jsxElement.forEach(expr => {
        computeJsSpans(okComponents, errComponents, expr, annots, spans);
      });

    case 'import':
    case 'export':
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      // TODO(jaked)
      // parsing should always succeed with some AST
      return ast.declarations.forEach(decls => {
        decls.forEach(decl => {
          computeJsSpans(okComponents, errComponents, decl, annots, spans);
        });
      });
    }
}

export default function computeHighlight(
  okComponents: components,
  errComponents: components,
  view: data.Types,
  content: string,
  ast: Try<any>,
  annots?: data.AstAnnotations,
) {
  const spans: Array<Span> = [];

  // TODO(jaked)
  // parsing should always succeed with some AST
  switch (view) {
    case 'mdx': {
      ast.forEach(ast => computeSpans(okComponents, errComponents, ast, annots, spans));
    }
    break;

    case 'json':
    case 'table':
    case 'meta': {
      ast.forEach(ast => computeJsSpans(okComponents, errComponents, ast, annots, spans));
    }
    break;
  }

  // necessary because we dependency-sort AST bindings in compileFileMdx
  // TODO(jaked) handle AST dependencies a better way
  spans.sort((a, b) => a.start - b.start);

  // TODO(jaked) this could use some tests
  const lineStartOffsets: Array<number> = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charAt(i) === "\n" || i === content.length - 1)
      lineStartOffsets.push(i + 1);
  }

  const lines: Array<React.ReactNode> = [];
  let lineNodes: Array<React.ReactNode> = [];
  let line = 0;
  let lineEnd = lineStartOffsets[1];
  let lastOffset = 0;

  function pushLine() {
    lines.push(lineNodes);
    lineNodes = [];
    lastOffset = lineEnd;
    line += 1;
    lineEnd = lineStartOffsets[line + 1];
  }

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    while (lastOffset < span.start) {
      if (span.start < lineEnd) {
        lineNodes.push(content.slice(lastOffset, span.start));
        lastOffset = span.start
      } else {
        lineNodes.push(content.slice(lastOffset, lineEnd));
        pushLine();
      }
    }
    const chunk = content.slice(span.start, span.end);
    const component = span.status ? errComponents[span.component] : okComponents[span.component];
    lineNodes.push(
      React.createElement(component as any, { 'data-status': span.status, 'data-link': span.link }, chunk)
    );
    lastOffset = span.end;
  }
  if (lastOffset < content.length) {
    while (lastOffset < content.length) {
      lineNodes.push(content.slice(lastOffset, lineEnd));
      pushLine();
    }
  } else {
    pushLine();
  }

  // the <br/> here is essential:
  // the textarea is the same height as the pre [why?]
  // if the value has a trailing newline,
  // the textarea permits navigating to the following line
  // but the pre doesn't render anything on that line
  // so the textarea is a line short and scrolls up
  // (so its text is out of sync with the pre)
  // thus we add an extra linebreak to the pre
  lines.push(React.createElement('br'));

  return lines;

  // TODO(jaked)
  // this doesn't work, I think because we need the textarea and pre
  // elements to scroll together (using the scrollbar on the outer div),
  // so we don't want the outer divs produced by react-window.
  // but maybe there is some code we can borrow?

  // TODO(jaked)
  // also, fixed-height lines doesn't work with line wrapping
  // but we could compute the wrapping (maybe?) and use VariableSizeList

  // const Row = ({ index, style }: { index: number, style: any }) =>
  //   <div style={style}>{lines[index]}</div>

  // return (
  //   <FixedSizeList
  //     itemCount={lines.length}
  //     itemSize={19} // TODO(jaked) compute line height
  //     width='100%'
  //     height={1400} // TODO(jaked) compute actual heigh
  //   >
  //     {Row}
  //   </FixedSizeList>
  // );
}
