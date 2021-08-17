import * as React from 'react';
import Signal from '../util/Signal';

// import { FixedSizeList } from 'react-window';
import RSCEditor, { Session } from './react-simple-code-editor';

import * as model from '../model';

import highlightCode from '../highlight/highlightCode';

interface Props {
  type: model.Types;
  content: string;
  compiledFile: Signal<model.CompiledFile>;
  session: Session;

  onChange: (content: string, session: Session) => void;
  setSelected: (name: string) => void;
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
    Signal.join(compiledFile.ast, compiledFile.interfaceMap ?? Signal.ok(undefined)).map(([ast, interfaceMap]) =>
      highlightCode(
        props.type,
        props.content,
        ast,
        interfaceMap,
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
