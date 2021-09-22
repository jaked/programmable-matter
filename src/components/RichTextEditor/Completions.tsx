import React from 'react';
import ReactDOM from 'react-dom';

type CompletionsProps = {
  target: () => Range;
  index: number;
  completions: string[];
  onClick: (index: number) => (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
}

const Completions = (props: CompletionsProps) => {
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    if (props.target && ref.current) {
      const completionsDiv = ref.current;
      const rect = props.target().getBoundingClientRect();
      completionsDiv.style.left = `${rect.left + window.pageXOffset}px`;
      completionsDiv.style.top = `${rect.bottom + window.pageYOffset}px`;

      const selectedElem = ref.current.children.item(props.index);
      if (selectedElem)
        selectedElem.scrollIntoView({ block: 'nearest' });
    }
  });

  return ReactDOM.createPortal(
    <div ref={ref} style={{
      backgroundColor: '#efefef',
      border: 'solid 1px #cccccc',
      top: '-9999px',
      left: '-9999px',
      position: 'absolute',
      width: '33vw',
      maxHeight: '50vh',
      overflow: 'auto',
      zIndex: 1,
    }}>{
      props.completions.map((completion, i) =>
        <div
          style={{
            padding: '4px 8px',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            cursor: 'pointer',
            background: props.index === i ? '#cccccc' : 'transparent',
          }}
          onClick={props.onClick(props.index)}
        >{completion}</div>
      )
    }</div>,
    document.body
  );
}

export default Completions;
