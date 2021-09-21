import React from 'react';
import { Range } from 'slate';
import { Editable, ReactEditor, Slate } from 'slate-react';

import Signal from '../../util/Signal';
import * as model from '../../model';
import * as PMAST from '../../pmast';

import makeRenderElement from './makeRenderElement';
import makeRenderLeaf from './makeRenderLeaf';
import makeDecorate from './makeDecorate';
import makeOnKeyDown from './makeOnKeyDown';
import makeEditor from './makeEditor';
import makeSetCompletionTarget from './makeSetCompletionTarget';
import Completions from './Completions';

import * as Focus from '../../app/focus';
import * as Files from '../../app/files';

export type RichTextEditorProps = {
  value: { children: PMAST.Node[] };
  setValue: (v: { children: PMAST.Node[] }) => void;
  moduleName: string;
  compiledFile: model.CompiledFile;

  setSelected: (name: string) => void;
}

const RichTextEditor = (props: RichTextEditorProps) => {
  const [target, setTarget] = React.useState<Range | undefined>();
  const [match, setMatch] = React.useState("");
  const [index, setIndex] = React.useState(0);

  const filesByName = Signal.useSignal(Files.filesByNameSignal);
  const completions = React.useMemo(() => {
    const completions: string[] = [];
    if (match) {
      const matchLowerCase = match.toLowerCase();
      for (const name of filesByName.keys()) {
        if (name.toLowerCase().includes(matchLowerCase)) {
          completions.unshift(name);
        }
      }
    }
    return completions;
  }, [match, filesByName]);

  const editor = React.useMemo(
    () => makeEditor({
      setTarget,
      setMatch,
      setIndex
    }),
    [props.moduleName, setTarget, setMatch, setIndex]
  );

  const focused = Signal.useSignal(Focus.editorFocused);
  React.useEffect(() => {
    if (focused) {
      ReactEditor.focus(editor);
    }
  }, [focused]);

  const onKeyDown = React.useMemo(() =>
    makeOnKeyDown(editor, {
      target,
      setTarget,
      index,
      setIndex,
      completions
    }),
    [editor, target, setTarget, index, setIndex, completions]
  );

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

  const setCompletionTarget = React.useMemo(
    () => makeSetCompletionTarget(editor, {
      setTarget,
      setMatch,
      setIndex
    }),
    [editor, setTarget, setMatch, setIndex]
  )

  const onChange = React.useCallback(
    children => {
      props.setValue({ children });
      if (target)
        setCompletionTarget();
    },
    [props.setValue, target, setCompletionTarget]
  )

  // key={props.moduleName} forces a remount when editor changes
  // to work around a slate-react bug
  // see https://github.com/ianstormtaylor/slate/issues/3886
  return <>
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
    { target && completions.length > 0 && <Completions
      editor={editor}
      target={target}
      match={match}
      index={index}
      completions={completions}
    />}
  </>;
};

export default RichTextEditor;
