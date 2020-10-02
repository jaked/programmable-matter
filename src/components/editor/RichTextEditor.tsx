import React from 'react';

import * as Slate from 'slate';
import * as SlateReact from 'slate-react';

import { bug } from '../../util/bug';

const renderElement = (props: SlateReact.RenderElementProps) => {
  switch (props.element.type) {
    case 'p':
      return <p {...props.attributes}>{props.children}</p>
    default:
      bug(`unexpected element type '${props.element.type}'`);
  }
}

export type RichTextEditorProps = {
  value: Slate.Node[],
  setValue: (nodes: Slate.Node[]) => void,
}

const RichTextEditor = (props: RichTextEditorProps) => {
  const editor = React.useMemo(() => SlateReact.withReact(Slate.createEditor()), []);
  return (
    <SlateReact.Slate editor={editor} value={props.value} onChange={props.setValue}>
      <SlateReact.Editable renderElement={renderElement} />
    </SlateReact.Slate>
  );
}

export default RichTextEditor;
