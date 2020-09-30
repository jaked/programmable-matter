import React from 'react';
import { Flex as FlexBase, Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

import Signal from '../util/Signal';

import * as data from '../data';

import { App } from '../app';

import { Session } from './react-simple-code-editor';

import { Catch } from './Catch';
import Sidebar from './search/Sidebar';
import Header from './Header'
import Editor from './Editor';

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

const EditorPane = React.memo(React.forwardRef<Editor, EditorPaneProps>((props, ref) =>
  <Flex flex={1} minWidth={0} flexDirection='column' >
    <Box padding={1} flex={1} minHeight={0} >
      <Signal.node signal={
        Signal.join(props.content, props.compiledFile).map(([ content, compiledFile ]) =>
          content !== null && compiledFile !== null ?
            <Signal.node signal={
              Signal.join(props.editorView, props.session, props.onChange).map(([ editorView, session, onChange ]) =>
                <Editor
                  ref={ref}
                  view={editorView}
                  content={content}
                  compiledFile={Signal.ok(compiledFile)}
                  session={session}
                  onChange={onChange}
                  setStatus={props.setStatus}
                  setSelected={props.setSelected}
                />
              )
            }/> :
            <Box padding={1}>no note</Box>
        )
      }/>
    </Box>
    <Signal.node signal={
      props.status.map(status =>
        <div style={{ backgroundColor: '#ffc0c0' }}>{status}</div>
      )
    }/>
  </Flex>
));

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

