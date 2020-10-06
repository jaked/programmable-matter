import React from 'react';
import * as Slate from 'slate';
import * as SlateReact from 'slate-react';
import isHotkey from 'is-hotkey';

import * as PMAST from '../../PMAST';
import * as PMEditor from './PMEditor';

export const renderElement = ({ element, attributes, children }: SlateReact.RenderElementProps) => {
  const block = element as PMAST.Block;
  switch (block.type) {
    case 'p':
      return <p {...attributes}>{children}</p>
    case 'h1':
      return <h1 {...attributes}>{children}</h1>
    case 'h2':
      return <h2 {...attributes}>{children}</h2>
    case 'h3':
      return <h3 {...attributes}>{children}</h3>
    case 'h4':
      return <h4 {...attributes}>{children}</h4>
    case 'h5':
      return <h5 {...attributes}>{children}</h5>
    case 'h6':
      return <h6 {...attributes}>{children}</h6>
  }
}

export const renderLeaf = ({ leaf, attributes, children } : SlateReact.RenderLeafProps) => {
  const text = leaf as PMAST.Text;
  if (text.bold)
    children = <strong>{children}</strong>;
  if (text.italic)
    children = <em>{children}</em>;
  if (text.underline)
    children = <u>{children}</u>;
  if (text.code)
    children = <code>{children}</code>;

  return <span {...attributes}>{children}</span>
}

const MARK_HOTKEYS = {
  'mod+b': 'bold',
  'mod+i': 'italic',
  'mod+u': 'underline',
  'mod+`': 'code',
}

const TYPE_HOTKEYS ={
  'mod+opt+0': 'p',
  'mod+opt+1': 'h1',
  'mod+opt+2': 'h2',
  'mod+opt+3': 'h3',
  'mod+opt+4': 'h4',
  'mod+opt+5': 'h5',
  'mod+opt+6': 'h6',
}

export const makeOnKeyDown = (editor: PMEditor.PMEditor) =>
  (e: React.KeyboardEvent) => {
    for (const hotkey in MARK_HOTKEYS) {
      if (isHotkey(hotkey, e as unknown as KeyboardEvent)) {
        e.preventDefault();
        const mark = MARK_HOTKEYS[hotkey];
        editor.toggleMark(mark);
      }
    }
    for (const hotkey in TYPE_HOTKEYS) {
      if (isHotkey(hotkey, e as unknown as KeyboardEvent)) {
        e.preventDefault();
        const type = TYPE_HOTKEYS[hotkey];
        editor.setType(type);
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
