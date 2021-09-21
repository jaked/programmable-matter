import React from 'react';
import ReactDOM from 'react-dom';
import { Editor, Range } from 'slate';
import { ReactEditor } from 'slate-react';
import Signal from '../../util/Signal';

type CompletionsProps = {
  editor: Editor;
  target: Range;
  match: string;
  index: number;
  completions: string[];
}

const Completions = (props: CompletionsProps) => {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    if (props.target && ref.current) {
      const completionsDiv = ref.current;
      const domRange = ReactEditor.toDOMRange(props.editor, props.target)
      const rect = domRange.getBoundingClientRect();
      completionsDiv.style.left = `${rect.left + window.pageXOffset}px`;
      completionsDiv.style.top = `${rect.bottom + window.pageYOffset}px`;
    }
  });

  return ReactDOM.createPortal(
    <div ref={ref} style={{
      padding: '8px',
      backgroundColor: '#ffffff',
      border: 'solid 1px #cccccc',
      top: '-9999px',
      left: '-9999px',
      position: 'absolute',
      zIndex: 1,
    }}>{
      props.completions.map((completion, i) =>
        <div style={{
          background: props.index === i ? '#cccccc' : 'transparent'
        }}>{completion}</div>
      )
    }</div>,
    document.body
  );
}

export default Completions;
