import * as React from 'react';

// import { FixedSizeList } from 'react-window';
import RSCEditor, { Session } from './react-simple-code-editor';

import styled from 'styled-components';
import * as MDXHAST from '../lang/mdxhast';
import * as ESTree from '../lang/ESTree';
import Type from '../lang/Type';

import * as data from '../data';

interface Props {
  view: data.Types;
  content: string;
  compiledFile: data.CompiledFile;
  session: Session;

  onChange: (content: string, session: Session) => void;
  setStatus: (status: string | undefined) => void;
  setSelected: (tag: string) => void;
}

const okComponents =
{
  default:    styled.span({ color: '#000000' }),
  atom:       styled.span({ color: '#221199' }),
  number:     styled.span({ color: '#116644' }),
  string:     styled.span({ color: '#aa1111' }),
  keyword:    styled.span({ color: '#770088' }),
  definition: styled.span({ color: '#0000ff' }),
  variable:   styled.span({ color: '#268bd2' }),
  property:   styled.span({ color: '#b58900' }),
  // TODO(jaked)
  // hover doesn't work because enclosing pre is not on top
  link:       styled.span`
    :hover {
      cursor: pointer;
    }
    color: #aa1111;
    text-decoration: underline;
  `,
}

const errStyle = { backgroundColor: '#ffc0c0' };

const errComponents =
{
  default:    styled(okComponents.default)(errStyle),
  atom:       styled(okComponents.atom)(errStyle),
  number:     styled(okComponents.number)(errStyle),
  string:     styled(okComponents.string)(errStyle),
  keyword:    styled(okComponents.keyword)(errStyle),
  definition: styled(okComponents.definition)(errStyle),
  variable:   styled(okComponents.variable)(errStyle),
  property:   styled(okComponents.property)(errStyle),
  link:       styled(okComponents.link)(errStyle),
}

type Span = {
  start: number,
  end: number,
  component: React.FunctionComponent<React.HTMLAttributes<HTMLSpanElement>>,
  status?: string,
  link?: string,
};

function computeJsSpans(
  ast: ESTree.Node,
  annots: data.AstAnnotations | undefined,
  spans: Array<Span>
) {
  function span(
    start: number,
    end: number,
    component: React.FunctionComponent<React.HTMLAttributes<HTMLSpanElement>>,
    status?: string,
    link?: string,
  ) {
    spans.push({ start, end, component, status, link });
  }

  function fn(ast: ESTree.Node) {
    let components = okComponents;
    let status: string | undefined = undefined;
    const type = annots && annots.get(ast);
    if (type && type.kind === 'Error') {
      components = errComponents;
      status = type.err.message;
    }

    switch (ast.type) {
      case 'Literal': {
        let component = components.default;
        switch (typeof ast.value) {
          case 'string': component = components.string; break;
          case 'number': component = components.number; break;
          case 'boolean': component = components.atom; break;
          case 'object': component = components.atom; break;
        }
        return span(ast.start, ast.end, component, status);
      }

      case 'JSXIdentifier':
      case 'Identifier':
        return span(ast.start, ast.start + ast.name.length, components.variable, status);

      case 'Property':
        ESTree.visit(ast.key, fn);
        if (!ast.shorthand) {
          ESTree.visit(ast.value, fn);
        }
        return false;

      case 'JSXAttribute':
        {
          // TODO(jaked) clean up duplication
          let components = okComponents;
          let status: string | undefined = undefined;
          let type = annots && annots.get(ast.name);
          if (type && type.kind === 'Error') {
            components = errComponents;
            status = type.err.message;
          }
          span(ast.name.start, ast.name.end, components.property, status);
        }
        ESTree.visit(ast.value, fn);
        return false;

      case 'ObjectExpression':
        span(ast.start, ast.start + 1, components.default, status);
        ESTree.visit(ast.properties, fn);
        span(ast.end - 1, ast.end, components.default, status);
        return false;

      case 'ObjectPattern':
        // TODO(jaked) fix status for props
        span(ast.start, ast.start + 1, components.default, status);
        ast.properties.forEach(prop => {
          span(prop.key.start, prop.key.end, components.definition, status);
          if (!prop.shorthand) {
            ESTree.visit(prop.value, fn);
          }
        });
        span(ast.end - 1, ast.end, components.default, status);
        if (ast.typeAnnotation) ESTree.visit(ast.typeAnnotation, fn);
        return false;

      case 'ArrayExpression':
        span(ast.start, ast.start + 1, components.default, status);
        ESTree.visit(ast.elements, fn);
        span(ast.end - 1, ast.end, components.default, status);
        return false;

      case 'ImportDeclaration':
        // TODO(jaked) handle `from`
        span(ast.start, ast.start + 6, components.keyword, status); // import
        ESTree.visit(ast.specifiers, fn);
        {
          // TODO(jaked) clean up duplication
          let components = okComponents;
          let status: string | undefined = undefined;
          let type = annots && annots.get(ast.source);
          if (type && type.kind === 'Error') {
            components = errComponents;
            status = type.err.message;
          }
          // TODO(jaked) maybe a link doesn't make sense for a nonexistent note
          const link = ast.source.value;
          span(ast.source.start, ast.source.end, components.link, status, link);
        }
        return false;

      case 'ImportSpecifier':
        // TODO(jaked) handle `as`
        span(ast.local.start, ast.local.end, components.definition, status);
        if (ast.imported.start !== ast.local.start) {
          span(ast.imported.start, ast.imported.end, components.variable, status);
        }
        return false;

      case 'ImportNamespaceSpecifier':
        // TODO(jaked) handle `as`
        span(ast.start, ast.start + 1, components.variable, status); // *
        span(ast.local.start, ast.local.end, components.definition, status);
        return false;

      case 'ImportDefaultSpecifier':
        span(ast.local.start, ast.local.end, components.definition, status);
        return false;

      case 'ExportNamedDeclaration':
        return span(ast.start, ast.start + 6, components.keyword, status); // export

      case 'ExportDefaultDeclaration':
        // TODO(jaked)
        // if you stick a comment between `export` and `default`
        // the whole thing is rendered as a keyword
        return span(ast.start, ast.declaration.start, components.keyword, status);

      case 'VariableDeclaration':
        return span(ast.start, ast.start + ast.kind.length, components.keyword, status);

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
          span(ast.id.start, ast.id.start + ast.id.name.length, components.definition, status);
          if (ast.id.typeAnnotation) ESTree.visit(ast.id.typeAnnotation, fn);
        }
        ESTree.visit(ast.init, fn);
        return false;

      case 'TSTypeLiteral':
        span(ast.start, ast.start + 1, components.default, status);
        ESTree.visit(ast.members, fn);
        span(ast.end - 1, ast.end, components.default, status);
        return false;

      case 'TSPropertySignature':
        // TODO(jaked) fix status for key
        span(ast.key.start, ast.key.end, components.definition, status);
        ESTree.visit(ast.typeAnnotation, fn);
        return false;

      case 'TSBooleanKeyword':
      case 'TSNumberKeyword':
      case 'TSStringKeyword':
      case 'TSNullKeyword':
      case 'TSUndefinedKeyword':
        span(ast.start, ast.end, components.variable, status);
    }
  }
  ESTree.visit(ast, fn);
}

function computeSpans(
  ast: MDXHAST.Node,
  annots: data.AstAnnotations | undefined,
  spans: Array<Span>
) {
  switch (ast.type) {
    case 'root':
    case 'element':
      return ast.children.forEach(child => computeSpans(child, annots, spans));

    case 'text':
      return;

    case 'jsx':
      if (!ast.jsxElement) throw new Error('expected JSX node to be parsed');
      // TODO(jaked)
      // parsing should always succeed with some AST
      return ast.jsxElement.forEach(expr => {
        computeJsSpans(expr, annots, spans);
      });

    case 'import':
    case 'export':
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      // TODO(jaked)
      // parsing should always succeed with some AST
      return ast.declarations.forEach(decls => {
        decls.forEach(decl => {
          computeJsSpans(decl, annots, spans);
        });
      });
    }
}

function computeHighlight(
  view: data.Types,
  content: string,
  compiledFile: data.CompiledFile
) {
  const ast = compiledFile.ast;
  const annots = compiledFile.astAnnotations;
  const spans: Array<Span> = [];

  // TODO(jaked)
  // parsing should always succeed with some AST
  switch (view) {
    case 'mdx': {
      ast.forEach(ast => computeSpans(ast, annots, spans));
    }
    break;

    case 'json':
    case 'table':
    case 'meta': {
      ast.forEach(ast => computeJsSpans(ast, annots, spans));
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
    const Component = span.component;
    const chunk = content.slice(span.start, span.end);
    lineNodes.push(
      <Component data-status={span.status} data-link={span.link}>{chunk}</Component>
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
  lines.push(<br/>);

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

export class Editor extends React.Component<Props, {}> {
  rscEditorRef = React.createRef<RSCEditor>();
  preRef = React.createRef<HTMLPreElement>();

  focus() {
    if (this.rscEditorRef.current) {
      this.rscEditorRef.current.focus();
    }
  }

  findHighlightSpan = (e: React.MouseEvent<HTMLTextAreaElement, MouseEvent>) => {
    if (!this.preRef.current) return;
    for (let i = 0; i < this.preRef.current.children.length; i++) {
      const child = this.preRef.current.children.item(i);
      if (child) {
        const clientRect = child.getBoundingClientRect();
        if (e.clientX >= clientRect.left && e.clientX <= clientRect.right &&
            e.clientY >= clientRect.top && e.clientY <= clientRect.bottom) {
          return (child as HTMLElement);
        }
      }
    }
  }

  onMouseEvent = (e: React.MouseEvent<HTMLTextAreaElement, MouseEvent>) => {
    const span = this.findHighlightSpan(e);
    if (span) {
      this.props.setStatus(span.dataset.status);
    } else {
      this.props.setStatus(undefined);
    }
  }

  onClick = (e: React.MouseEvent<HTMLTextAreaElement, MouseEvent>) => {
    const span = this.findHighlightSpan(e);
    if (span && span.dataset.link) {
      e.preventDefault();
      this.props.setSelected(span.dataset.link);
    }
  }

  render() {
    const { view, content, compiledFile } = this.props;
    let highlight = computeHighlight(view, content, compiledFile);
    return (
      <div style={{
        fontFamily: 'Monaco, monospace',
        fontSize: '14px',
      }}>
        <RSCEditor
          ref={this.rscEditorRef}
          preRef={this.preRef}
          value={content}
          session={this.props.session}
          onChange={this.props.onChange}
          highlight={_ => highlight}
          onMouseOver={this.onMouseEvent}
          onMouseMove={this.onMouseEvent}
          onClick={this.onClick}
        />
      </div>
    );
  }
}
