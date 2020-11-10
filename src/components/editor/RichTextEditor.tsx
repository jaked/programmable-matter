import React from 'react';
import { createEditor, Editor, Node } from 'slate';
import { withReact, Editable, RenderElementProps, RenderLeafProps, Slate } from 'slate-react';
import isHotkey from 'is-hotkey';

import * as PMAST from '../../PMAST';
import * as PMEditor from '../../editor/PMEditor';

export const renderElement = ({ element, attributes, children }: RenderElementProps) => {
  const pmElement = element as PMAST.Element;
  if (pmElement.type === 'a') {
    return React.createElement('a', { ...attributes, href: pmElement.href }, children);
  } else if (pmElement.type === 'code') {
    return React.createElement('pre', attributes,
      React.createElement('code', {}, children)
    );
  } else {
    return React.createElement(pmElement.type, attributes, children);
  }
}

export const renderLeaf = ({ leaf, attributes, children } : RenderLeafProps) => {
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
  'mod+opt+7': 'ul',
  'mod+opt+8': 'ol',
}

export const makeOnKeyDown = (editor: Editor) =>
  (re: React.KeyboardEvent) => {
    const e = re as unknown as KeyboardEvent;
    if (isHotkey('tab', e)) {
      e.preventDefault();
      PMEditor.indent(editor);
    }
    if (isHotkey('shift+tab', e)) {
      e.preventDefault();
      PMEditor.dedent(editor);
    }
    if (isHotkey('shift+enter', e)) {
      e.preventDefault();
      PMEditor.softBreak(editor);
    }
    if (isHotkey('mod+enter', e)) {
      e.preventDefault();
      PMEditor.exitBreak(editor);
    }
    for (const hotkey in MARK_HOTKEYS) {
      if (isHotkey(hotkey, e)) {
        e.preventDefault();
        const mark = MARK_HOTKEYS[hotkey];
        PMEditor.toggleMark(editor, mark);
      }
    }
    for (const hotkey in TYPE_HOTKEYS) {
      if (isHotkey(hotkey, e)) {
        e.preventDefault();
        const type = TYPE_HOTKEYS[hotkey];
        PMEditor.setType(editor, type);
      }
    }
  }

export type RichTextEditorProps = {
  value: PMAST.Node[],
  setValue: (nodes: PMAST.Node[]) => void,
}

const RichTextEditor = (props: RichTextEditorProps) => {
  const editor = React.useMemo(() => withReact(PMEditor.withPMEditor(createEditor())), []);
  const onKeyDown = React.useMemo(() => makeOnKeyDown(editor), [editor]);
  return (
    <Slate
      editor={editor}
      value={props.value}
      onChange={props.setValue as (nodes: Node[]) => void}
    >
      <Editable
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        onKeyDown={onKeyDown}
      />
    </Slate>
  );
}

export default RichTextEditor;
