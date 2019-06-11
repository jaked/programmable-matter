import * as React from 'react';
import RSCEditor from './react-simple-code-editor';

import * as MDXHAST from '../lang/mdxhast';
import * as AcornJsxAst from '../lang/acornJsxAst';

import * as data from '../data';

interface Props {
  content: string | null;
  compiledNote: data.Note | null;

  onChange: (content: string) => void;
}

type Span = { start: number, end: number, color: string };

const colors = {
  default: '#000000',
  atom: '#221199',
  number: '#116644',
  string: '#AA1111',
  keyword: '#770088',
  definition: '#0000ff',
  variable: '#268bd2',
  property: '#b58900',
}

function computeJsSpans(
  ast: AcornJsxAst.Node,
  spans: Array<Span>
) {
  function fn(ast: AcornJsxAst.Node) {
    switch (ast.type) {
      case 'Literal': {
        const start = ast.start;
        const end = ast.end;
        let color: string = colors.default;
        if (typeof ast.value === 'string') color = colors.string;
        else if (typeof ast.value === 'number') color = colors.number;
        else if (typeof ast.value === 'boolean') color = colors.atom;
        else if (typeof ast.value === 'object') color = colors.atom;
        spans.push({ start, end, color });
      }
      return;

      case 'JSXIdentifier':
      case 'Identifier': {
        const start = ast.start;
        const end = ast.end;
        const color = colors.variable;
        spans.push({ start, end, color });
      }
      return;

      case 'Property': {
        if (ast.key.type === 'Identifier') {
          const start = ast.key.start;
          const end = ast.key.end;
          const color = colors.property;
          spans.push({ start, end, color });

          AcornJsxAst.visit(ast.value, fn);
          return false;
        }
      }
      return;

      case 'JSXAttribute': {
        const start = ast.name.start;
        const end = ast.name.end;
        const color = colors.property;
        spans.push({ start, end, color });

        AcornJsxAst.visit(ast.value, fn);
        return false;
      }

      case 'ImportDeclaration': {
        // TODO(jaked) handle `from`
        const start = ast.start;
        const end = ast.start + 6; // import
        const color = colors.keyword;
        spans.push({ start, end, color });
      }
      return;

      case 'ImportNamespaceSpecifier':
        // TODO(jaked) handle `as`
        {
          const start = ast.start;
          const end = ast.start + 1; // *
          const color = colors.variable;
          spans.push({ start, end, color });
        }
        {
          const start = ast.local.start;
          const end = ast.local.end;
          const color = colors.definition;
          spans.push({ start, end, color });
        }
        return false;

      case 'ExportNamedDeclaration': {
        const start = ast.start;
        const end = ast.start + 6; // export
        const color = colors.keyword;
        spans.push({ start, end, color });
      }
      return;

      case 'VariableDeclaration': {
        const start = ast.start;
        const end = ast.start + ast.kind.length;
        const color = colors.keyword;
        spans.push({ start, end, color });
      }
      return;

      case 'VariableDeclarator': {
        const start = ast.id.start;
        const end = ast.id.end;
        const color = colors.definition;
        spans.push({ start, end, color });

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
  if (!compiledNote.parsed) throw new Error('expected note to be parsed');

  const spans: Array<Span> = [];
  // TODO(jaked)
  // parsing should always succeed with some AST
  compiledNote.parsed.forEach(parsed => {
    computeSpans(parsed.ast, spans);
  });

  const elements: Array<React.ReactNode> = [];
  let last = 0;
  for (let i = 0; i < spans.length; i++) {
    const span = spans[i];
    if (last < span.start) {
      elements.push(content.slice(last, span.start));
    }
    const color = span.color;
    const chunk = content.slice(span.start, span.end);
    elements.push(<span style={{ color }}>{chunk}</span>);
    last = span.end;
  }
  if (last < content.length) {
    elements.push(content.slice(last, content.length));
  }

  // the <br/> here is essential:
  // the textarea is the same height as the pre [why?]
  // if the value has a trailing newline,
  // the textarea permits navigating to the following line
  // but the pre doesn't render anything on that line
  // so the textarea is a line short and scrolls up
  // (so its text is out of sync with the pre)
  // thus we add an extra linebreak to the pre
  elements.push(<br/>);

  return elements;
}

export class Editor extends React.Component<Props, {}> {
  handleChange = (content: string) => {
    this.props.onChange(content)
  }

  render() {
    const { content, compiledNote } = this.props;
    if (content === null || compiledNote === null) {
      return <span>no note</span>
    } else {
      const highlight = computeHighlight(content, compiledNote);
      return (
        <div style={{
          fontFamily: 'Monaco, monospace',
          fontSize: '14px',
        }}>
          <RSCEditor
            value={content}
            onValueChange={this.handleChange}
            highlight={_ => highlight}
          />
        </div>
      );
    }
  }
}
