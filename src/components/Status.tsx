import React from 'react';
import ReactDOM from 'react-dom';
import Signal from '../util/Signal';

type StatusProps = {
  mouse: Signal<{ clientX: number, clientY: number }>;
}

const Status = (props: StatusProps) => {
  const mouse = Signal.useSignal(props.mouse);
  const [ status, setStatus ] = React.useState<undefined | string>(undefined);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    // we need to run this in an effect after the doc is rendered
    // since it relies on the rendered DOM
    const elem = document.elementFromPoint(mouse.clientX, mouse.clientY);

    let status: undefined | string = undefined;
    if (elem) {
      // Slate wraps an extra span around the text
      // so the element with the status field is its parent
      const parent = elem.parentElement;
      if (parent) {
        status = (parent as HTMLElement).dataset.status;
      }

      if (ref.current) {
        const statusDiv = ref.current;
        const rect = elem.getBoundingClientRect();
        statusDiv.style.left = `${rect.left + window.pageXOffset}px`;
        statusDiv.style.top = `${rect.bottom + window.pageYOffset + 5}px`;
      }
    }
    setStatus(status);
  }, [mouse]);

  return status ? ReactDOM.createPortal(
    <div ref={ref} style={{
      padding: '8px',
      backgroundColor: '#ffc0c0',
      top: '-9999px',
      left: '-9999px',
      position: 'absolute',
      zIndex: 1,
}}>{status}</div>,
    document.body
  ) : null;
}

export default Status
