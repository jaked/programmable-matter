import * as React from 'react';
import RSCEditor from './react-simple-code-editor';

import * as MDXHAST from '../lang/mdxhast';
import * as AcornJsxAst from '../lang/acornJsxAst';

import * as Try from '../util/Try';
import * as data from '../data';

interface Props {
  content: string | null;
  compiledNote: data.Note | null;

  onChange: (content: string) => void;
}

type Span = { start: number, end: number, color: string };

function computeJsSpans(
  ast: AcornJsxAst.Node,
  spans: Array<Span>
) {
  function fn(ast: AcornJsxAst.Node) {
    switch (ast.type) {
    case 'Literal':
      if (typeof ast.value === 'string') {
        spans.push({ start: ast.start, end: ast.end, color: '#a31515' });
      }
      return;
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
      return Try.forEach(ast.jsxElement, (expr) => {
        computeJsSpans(expr, spans);
      });

    case 'import':
    case 'export':
      if (!ast.declarations) throw new Error('expected import/export node to be parsed');
      // TODO(jaked)
      // parsing should always succeed with some AST
      return Try.forEach(ast.declarations, (decls) => {
        decls.forEach(decl => {
          computeJsSpans(decl, spans);
        });
      });
    }
}

function computeHighlight(content: string, compiledNote: data.Note) {
  if (!compiledNote.compiled) throw new Error('expected note to be compiled');

  const spans: Array<Span> = [];
  // TODO(jaked)
  // parsing should always succeed with some AST
  Try.forEach(compiledNote.compiled.ast, (ast) => {
    computeSpans(ast, spans);
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
          fontFamily: 'monospace',
          fontSize: '11pt',
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
