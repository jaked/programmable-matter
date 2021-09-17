import React from 'react';
import ReactDOM from 'react-dom';
import Signal from '../util/Signal';

type StatusProps = {
  mouse: Signal<{ clientX: number, clientY: number }>;
  selection: Signal<Selection | null>;
}

function getStatus(elem: Element | null): string | undefined {
  if (elem) {
    // Slate wraps an extra span around the text
    // so the element with the status field is its parent
    const parent = elem.parentElement;
    if (parent) {
      return (parent as HTMLElement).dataset.status;
    }
  }
}

const Status = (props: StatusProps) => {
  const mouse = Signal.useSignal(props.mouse);
  const selection = Signal.useSignal(props.selection);
  const [ status, setStatus ] = React.useState<undefined | string>(undefined);
  const [ elem, setElem ] = React.useState<null | Element>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useLayoutEffect(() => {
    let status: undefined | string = undefined;
    let elem: null | Element = null;

    elem = document.elementFromPoint(mouse.clientX, mouse.clientY);
    status = getStatus(elem);
    if (!status) elem = null;

    if (
      !status &&
      selection &&
      selection.isCollapsed &&
      selection.focusNode
    ) {
      // focusNode is text
      elem = selection.focusNode.parentElement;
      status = getStatus(elem);
    }
    if (!status) elem = null;

    setElem(elem);
    setStatus(status);
  }, [ mouse, selection ]);

  React.useLayoutEffect(() => {
    if (elem && status) {
      if (ref.current) {
        const statusDiv = ref.current;
        const rect = elem.getBoundingClientRect();
        statusDiv.style.left = `${rect.left + window.pageXOffset}px`;
        statusDiv.style.top = `${rect.bottom + window.pageYOffset + 5}px`;
      }
    }

  }, [elem, status]);

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
