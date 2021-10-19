import React from 'react';
import { Range, Transforms } from 'slate';
import { Editable, ReactEditor, Slate } from 'slate-react';

import { bug } from '../../util/bug';
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
    if (target) {
      const matchLowerCase = match.toLowerCase();
      for (const name of filesByName.keys()) {
        if (name.toLowerCase().includes(matchLowerCase)) {
          completions.unshift(name);
        }
      }
    }
    return completions;
  }, [target, match, filesByName]);

  const editor = React.useMemo(
    () => makeEditor({
      setTarget,
      setMatch,
      setIndex
    }),
    [props.moduleName, setTarget, setMatch, setIndex]
  );

  // TODO(jaked) fix up cursor position if it's no longer valid
  editor.children = props.value.children;

  const focused = Signal.useSignal(Focus.editorFocused);
  React.useEffect(() => {
    if (focused) {
      ReactEditor.focus(editor);
    }
  }, [focused]);

  const selectCompletion = React.useCallback((index: number) => {
    if (!target) bug(`expected target`);
    const name = completions[index];
    Transforms.select(editor, target);
    Transforms.insertNodes(editor, {
      type: 'a',
      href: name,
      children: [ { text: name } ]
    });
    setTarget(undefined);
  }, [editor, target, setTarget, completions]);

  const onKeyDown = React.useMemo(() =>
    makeOnKeyDown(editor, {
      target,
      setTarget,
      index,
      setIndex,
      completions,
      selectCompletion
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

  const onClick = React.useCallback(
    (index: number) => (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      e.preventDefault();
      selectCompletion(index);
      ReactEditor.focus(editor);
    },
    [selectCompletion, editor]
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
      target={() =>
        // TODO(jaked)
        // need to delay this until after Editable has rendered
        // or else the DOM / Slate mapping is not yet updated
        ReactEditor.toDOMRange(editor, target)
      }
      index={index}
      completions={completions}
      onClick={onClick}
    />}
  </>;
};

export default RichTextEditor;
