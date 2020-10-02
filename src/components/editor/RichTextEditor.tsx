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

const RichTextEditor = (props: {}) => {
  const editor = React.useMemo(() => SlateReact.withReact(Slate.createEditor()), []);
  const [value, setValue] = React.useState<Slate.Node[]>([
    {
      type: 'p',
      children: [{ text: 'A line of text in a paragraph.' }],
    },
  ]);
  return (
    <SlateReact.Slate editor={editor} value={value} onChange={newValue => setValue(newValue)}>
      <SlateReact.Editable renderElement={renderElement} />
    </SlateReact.Slate>
  );
}

export default RichTextEditor;
