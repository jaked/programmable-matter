import React from 'react';
import { createEditor, Editor, Node, Path, Point, Range as SlateRange, Transforms } from 'slate';
import { withReact, Editable, ReactEditor, RenderElementProps, RenderLeafProps, Slate } from 'slate-react';
import { withHistory } from 'slate-history';
import isHotkey from 'is-hotkey';
import styled from 'styled-components';

import Try from '../../util/Try';
import Signal from '../../util/Signal';
import * as model from '../../model';
import * as PMAST from '../../model/PMAST';
import * as Parse from '../../lang/Parse';
import * as ESTree from '../../lang/ESTree';
import * as PMEditor from '../../editor/PMEditor';
import * as Highlight from '../../lang/highlight';
import makeLink from '../../components/makeLink';

const okComponents =
{
  default:    styled.span({ color: '#000000' }),
  atom:       styled.span({ color: '#221199' }),
  number:     styled.span({ color: '#116644' }),
  string:     styled.span({ color: '#aa1111' }),
  keyword:    styled.span({ color: '#770088' }),
  definition: styled.span({ color: '#0000ff' }),
  variable:   styled.span({ color: '#268bd2' }),
  property:   styled.span({ color: '#b58900' }),

  link:       styled.span`
    :hover {
      cursor: pointer;
    }
    color: #aa1111;
    text-decoration: underline;
  `,
}

const errStyle = { backgroundColor: '#ffc0c0' };

const errComponents =
{
  default:    styled(okComponents.default)(errStyle),
  atom:       styled(okComponents.atom)(errStyle),
  number:     styled(okComponents.number)(errStyle),
  string:     styled(okComponents.string)(errStyle),
  keyword:    styled(okComponents.keyword)(errStyle),
  definition: styled(okComponents.definition)(errStyle),
  variable:   styled(okComponents.variable)(errStyle),
  property:   styled(okComponents.property)(errStyle),
  link:       styled(okComponents.link)(errStyle),
}

const Pre = styled.pre`
  background-color: #eeeeee;
  border-radius: 10px;
  padding: 10px;
`;

const Code = styled.code`
  background-color: #eeeeee;
  border-radius: 5px;
  padding: 5px;
`;

function makeRenderElement(
  moduleName: string,
  setSelected: (note: string) => void,
) {
  const Link = makeLink(moduleName, setSelected);

  return ({ element, attributes, children }: RenderElementProps) => {
    const pmElement = element as PMAST.Element;
    if (pmElement.type === 'a') {
      return React.createElement(Link, { ...attributes, href: pmElement.href }, children);
    } else if (pmElement.type === 'code') {
      return <Pre {...attributes}>
        <code>{children}</code>
      </Pre>
    } else if (pmElement.type === 'inlineCode') {
      return <Code {...attributes}>{children}</Code>
    } else {
      return React.createElement(pmElement.type, attributes, children);
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

type Range = {
  anchor: Point;
  focus: Point;
  highlight: Highlight.tag;
  status?: string;
  link?: string;
}

export const makeDecorate = (interfaceMap?: model.InterfaceMap) =>
  ([node, path]: [Node, Path]) => {
    // TODO(jaked) cache decorations
    const ranges: Range[] = [];
    const code: Try<ESTree.Node> | null =
      PMAST.isCode(node) ? Parse.parseCodeNode(node) :
      PMAST.isInlineCode(node) ? Parse.parseInlineCodeNode(node) :
      null;
    if (code) {
      code.forEach(code => {
        const spans: Highlight.Span[] = [];
        Highlight.computeJsSpans(code, interfaceMap, spans);
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
  value: { children: PMAST.Node[], selection: null | SlateRange };
  setValue: (v: { children: PMAST.Node[], selection: null | SlateRange }) => void;
  moduleName: string;
  compiledFile: model.CompiledFile;

  setSelected: (name: string) => void;
}

type RichTextEditor = {
  focus: () => void
}

const RichTextEditor = React.forwardRef<RichTextEditor, RichTextEditorProps>((props, ref) => {
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

  editor.selection = props.value.selection;

  React.useImperativeHandle(ref, () => ({
    focus: () => {
      ReactEditor.focus(editor);
    }
  }), [editor]);

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
        selection: editor.selection
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
});

export default RichTextEditor;
