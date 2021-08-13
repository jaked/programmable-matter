import React from 'react';
import { createEditor, Editor, Node, Path } from 'slate';
import { withReact, Editable, ReactEditor, RenderElementProps, RenderLeafProps, Slate } from 'slate-react';
import { withHistory } from 'slate-history';
import isHotkey from 'is-hotkey';
import styled from 'styled-components';

import { bug } from '../util/bug';
import Try from '../util/Try';
import Signal from '../util/Signal';
import * as model from '../model';
import * as PMAST from '../pmast';
import * as Parse from '../parse';
import * as ESTree from '../estree';
import * as PMEditor from '../editor/PMEditor';
import { Range, Span } from '../highlight/types';
import { computeJsSpans } from '../highlight/computeJsSpans';
import okComponents from '../highlight/components';
import errComponents from '../highlight/errComponents';
import { computeRanges } from '../highlight/prism';
import makeLink from '../components/makeLink';

import * as Focus from '../app/focus';

const LiveCode = styled.pre`
  background-color: #eeeeee;
  border-radius: 10px;
  padding: 10px;
`;

const InlineLiveCode = styled.code`
  background-color: #eeeeee;
  border-radius: 5px;
  padding: 5px;
`;

const Code = styled.pre`
  background-color: #f7f7f7;
  margin-left: 10px;
  margin-right: 10px;
  padding: 10px;
`;

function makeRenderElement(
  moduleName: string,
  setSelected: (note: string) => void,
) {
  const Link = makeLink(moduleName, setSelected);

  return ({ element, attributes, children }: RenderElementProps) => {
    if (PMAST.isCode(element)) {
      return <Code {...attributes}>
        <code>{children}</code>
      </Code>;

    } else if (PMAST.isLink(element)) {
      return React.createElement(Link, { ...attributes, href: element.href }, children);

    } else if (PMAST.isLiveCode(element)) {
      return <LiveCode {...attributes}>
        <code>{children}</code>
      </LiveCode>

    } else if (PMAST.isInlineLiveCode(element)) {
      return <InlineLiveCode {...attributes}>{children}</InlineLiveCode>

    } else {
      return React.createElement(element.type, attributes, children);
    }
  }
}

export const makeRenderLeaf = (
  setSelected: (name: string) => void = () => { },
) => {

  return ({ leaf, attributes, children } : RenderLeafProps) => {
    const text = leaf as PMAST.Text;
    if (text.highlight) {
      let onClick: (() => void) | undefined = undefined;
      if (text.link) {
        const link = text.link;
        onClick = () => { setSelected(link) };
      }

      if (text.status) {
        return React.createElement(
          errComponents[text.highlight] as any,
          { ...attributes, 'data-status': text.status, onClick },
          children
        );
      } else {
        return React.createElement(
          okComponents[text.highlight] as any,
          { ...attributes, onClick },
          children
        );
      }

    } else {
      if (text.bold)
        children = <strong>{children}</strong>;
      if (text.italic)
        children = <em>{children}</em>;
      if (text.underline)
        children = <u>{children}</u>;
      if (text.strikethrough)
        children = <del>{children}</del>;
      if (text.subscript)
        children = <sub>{children}</sub>;
      if (text.superscript)
        children = <sup>{children}</sup>;
      if (text.code)
        children = <code>{children}</code>;

      return <span {...attributes}>{children}</span>;
    }
  }
}

export const makeDecorate = (interfaceMap?: model.InterfaceMap) =>
  ([node, path]: [Node, Path]) => {
    // TODO(jaked) cache decorations?

    if (PMAST.isLiveCode(node) || PMAST.isInlineLiveCode(node)) {
      const ranges: Range[] = [];
      const code: Try<ESTree.Node> | null =
        PMAST.isLiveCode(node) ? Parse.parseLiveCodeNode(node) :
        PMAST.isInlineLiveCode(node) ? Parse.parseInlineLiveCodeNode(node) :
        null;
      if (code) {
        code.forEach(code => {
          const spans: Span[] = [];
          computeJsSpans(code, interfaceMap, spans);
          for (const span of spans) {
            ranges.push({
              anchor: { path, offset: span.start },
              focus: { path, offset: span.end },
              highlight: span.tag,
              status: span.status,
              link: span.link
            });
          }
        })
      }
      return ranges;

    } else if (PMAST.isCode(node) && node.language) {
      if (!(node.children.length === 1)) bug('expected 1 child');
      const child = node.children[0];
      if (!(PMAST.isText(child))) bug('expected text');
      const code = child.text;
      return computeRanges(path, code, node.language);

    } else {
      return [];
    }
  }

const MARK_HOTKEYS: { [k: string]: PMAST.mark } = {
  'mod+b':     'bold',
  'mod+i':     'italic',
  'mod+u':     'underline',
  'mod+e':     'code',
  'mod+opt+x': 'strikethrough',

  // TODO(jaked) these don't work
  'mod+opt+shift+_': 'subscript',
  'mod+opt+shift+^': 'superscript',
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
    [
      props.setSelected,

      // work around Slate bug where decorations are not considered in memoizing Text
      // https://github.com/ianstormtaylor/slate/issues/3447
      // TODO(jaked) this hurts performance a lot since we rerender all leaves on every edit
      // avoiding typechecking when code hasn't changed helps
      // but we still rerender all leaves on every code edit
      decorate,
    ]
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
