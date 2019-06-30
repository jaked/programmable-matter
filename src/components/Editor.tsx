import * as React from 'react';
// import { FixedSizeList } from 'react-window';
import RSCEditor, { Session } from './react-simple-code-editor';

import styled from 'styled-components';
import * as MDXHAST from '../lang/mdxhast';
import * as AcornJsxAst from '../lang/acornJsxAst';

import * as data from '../data';

interface Props {
  selected: string | null;
  content: string | null;
  compiledNote: data.Note | null;
  session: Session;

  onChange: (content: string) => void;
  saveSession: (session: Session) => void;
}

const components =
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

type Span = { start: number, end: number, Component: React.FunctionComponent };

function computeJsSpans(
  ast: AcornJsxAst.Node,
  spans: Array<Span>
) {
  function fn(ast: AcornJsxAst.Node) {
    switch (ast.type) {
      case 'Literal': {
        const start = ast.start;
        const end = ast.end;
        const Component = (() => {
          switch (typeof ast.value) {
            case 'string': return components.string;
            case 'number': return components.number;
            case 'boolean': return components.atom;
            case 'object': return components.atom;
            default: return components.default;
          }
        })();
        spans.push({ start, end, Component });
      }
      return;

      case 'JSXIdentifier':
      case 'Identifier': {
        const start = ast.start;
        const end = ast.end;
        const Component = components.variable;
        spans.push({ start, end, Component });
      }
      return;

      case 'Property': {
        if (ast.key.type === 'Identifier') {
          const start = ast.key.start;
          const end = ast.key.end;
          const Component = components.property;
          spans.push({ start, end, Component });

          AcornJsxAst.visit(ast.value, fn);
          return false;
        }
      }
      return;

      case 'JSXAttribute': {
        const start = ast.name.start;
        const end = ast.name.end;
        const Component = components.property;
        spans.push({ start, end, Component });

        AcornJsxAst.visit(ast.value, fn);
        return false;
      }

      case 'ImportDeclaration': {
        // TODO(jaked) handle `from`
        const start = ast.start;
        const end = ast.start + 6; // import
        const Component = components.keyword;
        spans.push({ start, end, Component });
      }
      return;

      case 'ImportNamespaceSpecifier':
        // TODO(jaked) handle `as`
        {
          const start = ast.start;
          const end = ast.start + 1; // *
          const Component = components.variable;
          spans.push({ start, end, Component });
        }
        {
          const start = ast.local.start;
          const end = ast.local.end;
          const Component = components.definition;
          spans.push({ start, end, Component });
        }
        return false;

      case 'ExportNamedDeclaration': {
        const start = ast.start;
        const end = ast.start + 6; // export
        const Component = components.keyword;
        spans.push({ start, end, Component });
      }
      return;

      case 'VariableDeclaration': {
        const start = ast.start;
        const end = ast.start + ast.kind.length;
        const Component = components.keyword;
        spans.push({ start, end, Component });
      }
      return;

      case 'VariableDeclarator': {
        const start = ast.id.start;
        const end = ast.id.end;
        const Component = components.definition;
        spans.push({ start, end, Component });

        AcornJsxAst.visit(ast.init, fn);
        return false;
      }
    }
  }
  AcornJsxAst.visit(ast, fn);
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

function computeHighlight(content: string, compiledNote: data.Note) {
  const spans: Array<Span> = [];
  // TODO(jaked)
  // parsing should always succeed with some AST
  switch (compiledNote.type) {
    case 'mdx':
      if (!compiledNote.parsed) throw new Error('expected note to be parsed');
      compiledNote.parsed.forEach(parsed => {
        computeSpans(parsed.ast, spans);
      });
      break;

    case 'json':
      if (!compiledNote.parsed) throw new Error('expected note to be parsed');
      compiledNote.parsed.forEach(parsed => {
        computeJsSpans(parsed.ast, spans);
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
    const Component = span.Component;
    const chunk = content.slice(span.start, span.end);
    lineNodes.push(<Component>{chunk}</Component>);
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
    const { selected, content, compiledNote } = this.props;
    if (selected === null || content === null || compiledNote === null) {
      return <span>no note</span>
    } else {
      const highlight = computeHighlight(content, compiledNote);
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
          />
        </div>
      );
    }
  }
}
