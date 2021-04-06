import * as React from 'react';

import * as ESTree from '../lang/ESTree';
import * as Highlight from '../lang/highlight';
import * as model from '../model';

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

export default function computeHighlight(
  view: model.Types,
  content: string,
  ast: unknown,
  typeMap: model.TypeMap | undefined,
  okComps: components,
  errComps: components,
) {
  const spans: Array<Highlight.Span> = [];

  // TODO(jaked)
  // parsing should always succeed with some AST
  switch (view) {
    case 'pm':
      break;

    case 'json':
    case 'table':
    case 'meta': {
      Highlight.computeJsSpans(ast as ESTree.Node, typeMap, spans);
    }
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
    const chunk = content.slice(span.start, span.end);
    const component = span.status ? errComps[span.tag] : okComps[span.tag];
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
