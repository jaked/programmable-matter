import React from 'react';
import { Flex as FlexBase, Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

import Signal from '../util/Signal';

import * as data from '../data';
import * as PMAST from '../PMAST';

import { App } from '../app';

import { Session } from './react-simple-code-editor';

import { Catch } from './Catch';
import Sidebar from './search/Sidebar';
import Header from './Header'
import Editor from './Editor';
import RichTextEditor from './editor/RichTextEditor';

interface Props {
  app: App;
}

const Box = styled(BoxBase)({
  height: '100%',
  overflow: 'auto',
}, borders);

const Flex = styled(FlexBase)({
}, borders);

type EditorPaneProps = {
  content: Signal<string | null>;
  compiledFile: Signal<data.CompiledFile | null>;
  editorView: Signal<'meta' | 'pm' | 'mdx' | 'json' | 'table'>;
  session: Signal<Session>;
  status: Signal<string | undefined>;
  onChange: Signal<(updateContent: string, session: Session) => void>;
  setStatus: (status: string | undefined) => void;
  setSelected: (selected: string | null) => void;
}

type CodeEditorProps = {
  content: string;
  compiledFile: data.CompiledFile;
  editorView: 'meta' | 'pm' | 'mdx' | 'json' | 'table';
  session: Signal<Session>;
  onChange: Signal<(updateContent: string, session: Session) => void>;
  setStatus: (status: string | undefined) => void;
  setSelected: (selected: string | null) => void;
}

const CodeEditor = React.memo(React.forwardRef<Editor, CodeEditorProps>((props, ref) => {
  const session = Signal.useSignal(props.session);
  const onChange = Signal.useSignal(props.onChange);

  return (
    <Editor
      ref={ref}
      view={props.editorView}
      content={props.content}
      compiledFile={Signal.ok(props.compiledFile)}
      session={session}
      onChange={onChange}
      setStatus={props.setStatus}
      setSelected={props.setSelected}
    />
  );
}));

type RichEditorProps = {
  content: string;
  session: Signal<Session>;
  onChange: Signal<(updateContent: string, session: Session) => void>;
}

const RichEditor = React.memo<RichEditorProps>(props => {
  const session = Signal.useSignal(props.session);
  const onChange = Signal.useSignal(props.onChange);

  // TODO(jaked) serialization should go elsewhere
  // TODO(jaked) don't deserialize / serialize on every edit
  const value: PMAST.Node[] = props.content ?
    PMAST.parse(props.content) :
    [
      {
        type: 'p',
        children: [{ text: '' }]
      }
    ]
  const setValue = (nodes: PMAST.Node[]) => {
    const json = PMAST.stringify(nodes);
    onChange(json, session);
  }

  return (
    <RichTextEditor value={value} setValue={setValue} />
  );
});

const EditorPane = React.memo(React.forwardRef<Editor, EditorPaneProps>((props, ref) => {
  // TODO(jaked) use Signal.join here? not sure about lifetime
  const content = Signal.useSignal(props.content);
  const compiledFile = Signal.useSignal(props.compiledFile);
  const editorView = Signal.useSignal(props.editorView);
  const status = Signal.useSignal(props.status);

  return (
    <Flex flex={1} minWidth={0} flexDirection='column' >
      <Box padding={1} flex={1} minHeight={0} >{
        content === null || compiledFile == null ?
          <Box padding={1}>no note</Box> :
        editorView === 'pm' ?
          <RichEditor
            content={content}
            session={props.session}
            onChange={props.onChange}
          /> :
          <CodeEditor
            ref={ref}
            editorView={editorView}
            content={content}
            compiledFile={compiledFile}
            session={props.session}
            onChange={props.onChange}
            setStatus={props.setStatus}
            setSelected={props.setSelected}
          />
      }</Box>
      <div style={{ backgroundColor: '#ffc0c0' }}>{status}</div>
    </Flex>
  );
}));

type DisplayPaneProps = {
  compiledNoteSignal: Signal<data.CompiledNote | null>;
}

const DisplayPane = React.memo((props: DisplayPaneProps) =>
  <Box
    flex={1}
    minWidth={0}
    padding={1}
  >
    <Signal.node signal={
      props.compiledNoteSignal.flatMap(compiledNote =>
        compiledNote ?
          compiledNote.rendered :
          Signal.ok('no note')
      )
    }/>
  </Box>
);

type Main = {
  focusSearchBox: () => void;
}

const Main = React.forwardRef<Main, Props>((props, ref) => {
  const sideBarVisible = Signal.useSignal(props.app.sideBarVisibleCell);
  const mainPaneView = Signal.useSignal(props.app.mainPaneViewCell);

  const sidebarRef = React.useRef<Sidebar>(null);
  const editorRef = React.useRef<Editor>(null);

  // TODO(jaked) necessary to avoid spurious rerenders until Main is memoized
  const focusEditor = React.useCallback(() => {
    editorRef.current && editorRef.current.focus();
  }, []);

  const focusSearchBox = () => {
    sidebarRef.current && sidebarRef.current.focusSearchBox();
  }

  React.useImperativeHandle(ref, () => ({
    focusSearchBox
  }))

  const [sideBarWidth, mainPaneWidth] =
    sideBarVisible ? [ 1/5, 4/5 ] : [ 0, 1 ];
  const [showEditorPane, showDisplayPane] = (
    mainPaneView === 'code' ? [true, false] :
    mainPaneView === 'display' ? [false, true] :
    /* props.app.mainPaneView === 'split' ? */ [true, true]
  );

  return (
    <Flex style={{ height: '100vh' }}>
      { sideBarWidth === 0 ? null :
        <Catch>
          <Flex width={sideBarWidth} flexDirection='column'>
            <Sidebar
              ref={sidebarRef}
              compiledNotes={props.app.compiledNotesSignal}
              selected={props.app.selectedCell}
              setSelected={props.app.setSelected}
              maybeSetSelected={props.app.maybeSetSelected}
              focusDir={props.app.focusDirCell}
              setFocusDir={props.app.setFocusDir}
              onNewNote={props.app.onNewNoteSignal}
              focusEditor={focusEditor}
            />
          </Flex>
        </Catch>
      }
      { sideBarWidth === 0 ? null :
          <Box width='1px' backgroundColor='#cccccc' />
      }
      <Flex flex={1} minWidth={0} flexDirection='column'>
        <Header
          name={props.app.selectedCell}
          setName={props.app.setNameSignal}
          editName={props.app.editNameCell}
          setEditName={props.app.setEditName}
          focusEditor={focusEditor}
          editorView={props.app.editorViewCell}
          setEditorView={props.app.setEditorView}
          selectedNoteProblems={props.app.selectedNoteProblemsSignal}
          />
        <Flex flex={1} minHeight={0}>
          { showEditorPane &&
            <Catch>
              <EditorPane
                ref={editorRef}
                content={props.app.contentSignal}
                compiledFile={props.app.compiledFileSignal}
                editorView={props.app.editorViewCell}
                session={props.app.sessionSignal}
                status={props.app.statusCell}
                onChange={props.app.setContentAndSessionSignal}
                setStatus={props.app.setStatus}
                setSelected={props.app.setSelected}
              />
            </Catch>
          }
          { showEditorPane && showDisplayPane &&
              <Box width='1px' backgroundColor='#cccccc' />
          }
          { showDisplayPane &&
            <Catch>
              <DisplayPane
                compiledNoteSignal={props.app.compiledNoteSignal}
              />
            </Catch>
          }
        </Flex>
      </Flex>
    </Flex>
  );
});

export default Main;

