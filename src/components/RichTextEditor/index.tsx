import React from 'react';
import { createEditor } from 'slate';
import { withReact, Editable, ReactEditor, Slate } from 'slate-react';
import { withHistory } from 'slate-history';

import Signal from '../../util/Signal';
import * as model from '../../model';
import * as PMAST from '../../pmast';
import * as PMEditor from '../../editor/PMEditor';

import makeRenderElement from './makeRenderElement';
import makeRenderLeaf from './makeRenderLeaf';
import makeDecorate from './makeDecorate';
import makeOnKeyDown from './makeOnKeyDown';

import * as Focus from '../../app/focus';

export type RichTextEditorProps = {
  value: { children: PMAST.Node[] };
  setValue: (v: { children: PMAST.Node[] }) => void;
  moduleName: string;
  compiledFile: model.CompiledFile;

  setSelected: (name: string) => void;
}

const RichTextEditor = (props: RichTextEditorProps) => {
  const editor = React.useMemo(() => {
    const editor = withHistory(withReact(PMEditor.withPMEditor(createEditor())));

    // the default react-slate insertData splits inserted text into lines
    // and wraps the enclosing element around each line.
    // we don't always want that behavior, so override it
    // and pass multiline text directly to insertText.
    const { insertData } = editor;
    editor.insertData = (data: DataTransfer) => {
      if (data.getData('application/x-slate-fragment')) {
        insertData(data);
      } else {
        const text = data.getData('text/plain');
        if (text) {
          editor.insertText(text);
        }
      }
    };
    return editor;
  }, [props.moduleName]);

  const focused = Signal.useSignal(Focus.editorFocused);
  React.useEffect(() => {
    if (focused) {
      ReactEditor.focus(editor);
    }
  }, [focused]);

  const onKeyDown = React.useMemo(() => makeOnKeyDown(editor), [editor]);
  // TODO(jaked) can we use interfaceMap conditionally? breaks the rules of hooks but does it matter?
  const interfaceMap = Signal.useSignal(props.compiledFile.interfaceMap ?? Signal.ok(undefined));
  const decorate = React.useMemo(
    () => makeDecorate(interfaceMap),
    [interfaceMap],
  );

  const renderLeaf = React.useMemo(
    () => makeRenderLeaf(props.setSelected),
    [ props.setSelected ]
  );

  const renderElement = React.useMemo(
    () => makeRenderElement(props.moduleName, props.setSelected),
    [props.moduleName, props.setSelected]
  );

  const onChange = React.useCallback(
    children => {
      props.setValue({
        children: children as PMAST.Node[],
      });
    },
    [editor, props.setValue]
  )

  // key={props.moduleName} forces a remount when editor changes
  // to work around a slate-react bug
  // see https://github.com/ianstormtaylor/slate/issues/3886
  return (
    <Slate
      key={props.moduleName}
      editor={editor}
      value={props.value.children}
      onChange={onChange}
    >
      <Editable
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        decorate={decorate}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
    </Slate>
  );
};

export default RichTextEditor;
