import * as React from 'react';

// import { FixedSizeList } from 'react-window';
import RSCEditor, { Session } from './react-simple-code-editor';

import styled from 'styled-components';
import * as MDXHAST from '../lang/mdxhast';
import * as ESTree from '../lang/ESTree';

import * as data from '../data';

interface Props {
  selected: string | null;
  content: string | null;
  parsedNote: data.ParsedNote | null;
  session: Session;

  onChange: (content: string) => void;
  saveSession: (session: Session) => void;
  setStatus: (status: string | undefined) => void;
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
}

type Span = {
  start: number,
  end: number,
  component: React.FunctionComponent<React.HTMLAttributes<HTMLSpanElement>>,
  status: string
};

function computeJsSpans(
  ast: ESTree.Node,
  spans: Array<Span>
) {
  function span(
    start: number,
    end: number,
    component: React.FunctionComponent<React.HTMLAttributes<HTMLSpanElement>>,
    status: string
  ) {
    spans.push({ start, end, component, status });
  }

  function fn(ast: ESTree.Node) {
    let components = okComponents;
    let status = '';
    if (ast.etype) {
      if (ast.etype.type === 'err') {
        components = errComponents;
        status = ast.etype.err.toString();
      }
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
        return span(ast.start, ast.end, components.variable, status);

      case 'Property':
        ESTree.visit(ast.key, fn);
        if (!ast.shorthand) {
          ESTree.visit(ast.value, fn);
        }
        return false;

      case 'JSXAttribute':
        span(ast.name.start, ast.name.end, components.property, status);
        ESTree.visit(ast.value, fn);
        return false;

      case 'ObjectExpression':
        span(ast.start, ast.start + 1, components.default, status);
        ESTree.visit(ast.properties, fn);
        span(ast.end - 1, ast.end, components.default, status);
        return false;

      case 'ArrayExpression':
        span(ast.start, ast.start + 1, components.default, status);
        ESTree.visit(ast.elements, fn);
        span(ast.end - 1, ast.end, components.default, status);
        return false;

      case 'ImportDeclaration':
        // TODO(jaked) handle `from`
        return span(ast.start, ast.start + 6, components.keyword, status); // import

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
        span(ast.id.start, ast.id.end, components.definition, status);
        ESTree.visit(ast.init, fn);
        return false;
    }
  }
  ESTree.visit(ast, fn);
}

function computeSpans(ast: MDXHAST.Node, spans: Array<Span>) {
  switch (ast.type) {
    case 'root':
    case 'element':
      return ast.children.forEach(child => computeSpans(child, spans));

    case 'text':
      return;

    case 'jsx':
      if (!ast.jsxElement) throw new Error('expected JSX node to be parsed');
      // TODO(jaked)
      // parsing should always succeed with some AST
      return ast.jsxElement.forEach(expr => {
        computeJsSpans(expr, spans);
      });

    case 'import':
    case 'export':
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      // TODO(jaked)
      // parsing should always succeed with some AST
      return ast.declarations.forEach(decls => {
        decls.forEach(decl => {
          computeJsSpans(decl, spans);
        });
      });
    }
}

function computeHighlight(content: string, parsedNote: data.ParsedNote) {
  const spans: Array<Span> = [];
  // TODO(jaked)
  // parsing should always succeed with some AST
  switch (parsedNote.type) {
    case 'mdx':
      parsedNote.ast.forEach(ast => {
        computeSpans(ast, spans);
      });
      break;

    case 'json':
      parsedNote.ast.forEach(ast => {
        computeJsSpans(ast, spans);
      });
      break;

    case 'ts':
      parsedNote.ast.forEach(ast => {
        computeJsSpans(ast, spans);
      });
      break;
    }

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
      <Component data-status={span.status}>{chunk}</Component>
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

  constructor(props: Props) {
    super(props);

    this.onValueChange = this.onValueChange.bind(this);
  }

  focus() {
    if (this.rscEditorRef.current) {
      this.rscEditorRef.current.focus();
    }
  }

  // TODO(jaked)
  // would be nice if session were a prop on RSCEditor
  setSession() {
    if (this.rscEditorRef.current) {
      this.rscEditorRef.current.session = this.props.session;
    }
  }
  componentDidMount() { this.setSession(); }
  componentDidUpdate() { this.setSession(); }

  onValueChange(x: string) {
    this.props.onChange(x);
    if (this.rscEditorRef.current) {
      this.props.saveSession(this.rscEditorRef.current.session);
    }
  }

  render() {
    const { selected, content, parsedNote } = this.props;
    if (selected === null || content === null || parsedNote === null) {
      return <span>no note</span>
    } else {
      const highlight = computeHighlight(content, parsedNote);
      return (
        <div style={{
          fontFamily: 'Monaco, monospace',
          fontSize: '14px',
        }}>
          <RSCEditor
            ref={this.rscEditorRef}
            name={selected}
            value={content}
            onValueChange={this.onValueChange}
            highlight={_ => highlight}
            setStatus={this.props.setStatus}
          />
        </div>
      );
    }
  }
}
