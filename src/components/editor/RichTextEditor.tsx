import React from 'react';

import * as Slate from 'slate';
import * as SlateReact from 'slate-react';

import isHotkey from 'is-hotkey';

import * as PMAST from '../../PMAST';

import * as PMEditor from './PMEditor';

import { bug } from '../../util/bug';

export const renderElement = ({ element, attributes, children }: SlateReact.RenderElementProps) => {
  switch (element.type) {
    case 'p':
      return <p {...attributes}>{children}</p>
    default:
      bug(`unexpected element type '${element.type}'`);
  }
}

export const renderLeaf = ({ leaf, attributes, children } : SlateReact.RenderLeafProps) => {
  if (leaf.bold)
    children = <strong>{children}</strong>;
  if (leaf.italic)
    children = <em>{children}</em>;
  if (leaf.underline)
    children = <u>{children}</u>;
  if (leaf.code)
    children = <code>{children}</code>;

  return <span {...attributes}>{children}</span>
}

const HOTKEYS = {
  'mod+b': 'bold',
  'mod+i': 'italic',
  'mod+u': 'underline',
  'mod+`': 'code',
}

export const makeOnKeyDown = (editor: PMEditor.PMEditor) =>
  (e: React.KeyboardEvent) => {
    for (const hotkey in HOTKEYS) {
      if (isHotkey(hotkey, e as unknown as KeyboardEvent)) {
        e.preventDefault();
        const mark = HOTKEYS[hotkey];
        editor.toggleMark(mark);
      }
    }
  }

export type RichTextEditorProps = {
  value: PMAST.Node[],
  setValue: (nodes: PMAST.Node[]) => void,
}

const RichTextEditor = (props: RichTextEditorProps) => {
  const editor = React.useMemo(() => SlateReact.withReact(PMEditor.withPMEditor(Slate.createEditor())), []);
  const onKeyDown = React.useMemo(() => makeOnKeyDown(editor), [editor]);
  return (
    <SlateReact.Slate
      editor={editor}
      value={props.value}
      onChange={props.setValue as (nodes: Slate.Node[]) => void}
    >
      <SlateReact.Editable
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        onKeyDown={onKeyDown}
      />
    </SlateReact.Slate>
  );
}

export default RichTextEditor;
