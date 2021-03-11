import * as React from 'react';
import Signal from '../util/Signal';

// import { FixedSizeList } from 'react-window';
import RSCEditor, { Session } from './react-simple-code-editor';

import styled from 'styled-components';

import * as model from '../model';

import highlight from './highlight'

interface Props {
  type: model.Types;
  content: string;
  compiledFile: Signal<model.CompiledFile>;
  session: Session;

  onChange: (content: string, session: Session) => void;
  setSelected: (name: string) => void;
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

type Editor = {
  focus: () => void
};

const Editor = React.memo(React.forwardRef<Editor, Props>((props, ref) => {
  const rscEditorRef = React.useRef<RSCEditor>(null);
  const preRef = React.useRef<HTMLPreElement>(null);

  React.useImperativeHandle(ref, () => ({
    focus: () => {
      if (rscEditorRef.current) {
        rscEditorRef.current.focus();
      }
    }
  }));

  const findHighlightSpan = (e: React.MouseEvent<HTMLTextAreaElement, MouseEvent>) => {
    if (!preRef.current) return;
    for (let i = 0; i < preRef.current.children.length; i++) {
      const child = preRef.current.children.item(i);
      if (child) {
        const clientRect = child.getBoundingClientRect();
        if (e.clientX >= clientRect.left && e.clientX <= clientRect.right &&
            e.clientY >= clientRect.top && e.clientY <= clientRect.bottom) {
          return (child as HTMLElement);
        }
      }
    }
  }

  const onClick = (e: React.MouseEvent<HTMLTextAreaElement, MouseEvent>) => {
    const span = findHighlightSpan(e);
    if (span && span.dataset.link) {
      e.preventDefault();
      props.setSelected(span.dataset.link);
    }
  }

  const highlighted = props.compiledFile.flatMap(compiledFile =>
    Signal.join(compiledFile.ast, compiledFile.astAnnotations ?? Signal.ok(undefined)).map(([ast, annots]) =>
      highlight(
        props.type,
        props.content,
        ast,
        annots,
        okComponents,
        errComponents
      )
    )
  );

  return (
    <div style={{
      fontFamily: 'Monaco, monospace',
      fontSize: '14px',
    }}>
      <RSCEditor
        ref={rscEditorRef}
        preRef={preRef}
        value={props.content}
        session={props.session}
        onChange={props.onChange}
        highlight={Signal.node(highlighted)}
        onClick={onClick}
      />
    </div>
  );
}));

export default Editor;
