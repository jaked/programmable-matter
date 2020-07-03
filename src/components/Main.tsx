import React from 'react';
import { Flex as FlexBase, Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

import Signal from '../util/Signal';

import * as data from '../data';

import { App } from '../app';

import { Session } from './react-simple-code-editor';

import { Catch } from './Catch';
import Display from './Display';
import Editor from './Editor';
import Sidebar from './Sidebar';
import TabBar from './TabBar';

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
  editorView: Signal<'meta' | 'mdx' | 'json' | 'table'>;
  session: Signal<Session>;
  selectedNoteProblems: Signal<{ meta?: boolean, mdx?: boolean, json?: boolean, table?: boolean }>;
  status: Signal<string | undefined>;
  onChange: Signal<(updateContent: string, session: Session) => void>;
  setStatus: (status: string | undefined) => void;
  setSelected: (selected: string | null) => void;
  setEditorView: (view: 'meta' | 'mdx' | 'json' | 'table') => void;
  width: number;
}

const EditorPane = React.memo(React.forwardRef<Editor, EditorPaneProps>((props, ref) =>
  <Flex
    flexDirection='column'
    justifyContent='space-between'
    width={props.width}
    borderColor='#cccccc'
    borderStyle='solid'
    borderWidth='0px 0px 0px 1px'
  >
    <Flex
      flexDirection='column'
    >
      <TabBar
        editorView={props.editorView}
        setEditorView={props.setEditorView}
        selectedNoteProblems={props.selectedNoteProblems}
      />
      <Box padding={1} >
        <Display signal={
          Signal.join(props.content, props.compiledFile).map(([ content, compiledFile ]) =>
            content !== null && compiledFile !== null ?
              <Display signal={
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
                )}/> :
              <Box padding={1}>no note</Box>
            )
        }/>
      </Box>
    </Flex>
    <Display signal={
      props.status.map(status =>
        <div style={{ backgroundColor: '#ffc0c0' }}>{status}</div>
      )
    }/>
  </Flex>
));

type DisplayPaneProps = {
  compiledNoteSignal: Signal<data.CompiledNote | null>;
  width: number;
}

const DisplayPane = React.memo((props: DisplayPaneProps) =>
  <Box
    width={props.width}
    padding={1}
    borderColor='#cccccc'
    borderStyle='solid'
    borderWidth='0px 0px 0px 1px'
  >
    <Display signal={
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
    props.app.sideBarVisible ? [ 1/6, 5/6 ] : [ 0, 1 ];
  const [editorPaneWidth, displayPaneWidth] = (
    props.app.mainPaneView === 'code' ? [1, 0] :
    props.app.mainPaneView === 'display' ? [0, 1] :
    /* props.app.mainPaneView === 'split' ? */ [1/2, 1/2]
  ).map(w => w * mainPaneWidth);

  return (
    <Flex style={{ height: '100vh' }}>
      { sideBarWidth === 0 ? null :
        <Catch>
          <Flex width={sideBarWidth} flexDirection='column'>
            <Sidebar
              ref={sidebarRef}
              render={props.app.render}
              compiledNotes={props.app.compiledNotesSignal}
              selected={props.app.selectedCell}
              onSelect={props.app.setSelected}
              newNote={props.app.newNote}
              focusEditor={focusEditor}
            />
          </Flex>
        </Catch>
      }
      { editorPaneWidth === 0 ? null :
        <Catch>
          <EditorPane
            ref={editorRef}
            content={props.app.contentSignal}
            compiledFile={props.app.compiledFileSignal}
            editorView={props.app.editorViewCell}
            session={props.app.sessionSignal}
            selectedNoteProblems={props.app.selectedNoteProblemsSignal}
            status={props.app.statusCell}
            onChange={props.app.setContentAndSessionSignal}
            setStatus={props.app.setStatus}
            setSelected={props.app.setSelected}
            setEditorView={props.app.setEditorView}
            width={editorPaneWidth}
          />
        </Catch>
      }
      { displayPaneWidth === 0 ? null :
        <Catch>
          <DisplayPane
            compiledNoteSignal={props.app.compiledNoteSignal}
            width={displayPaneWidth}
          />
        </Catch>
      }
    </Flex>
  );
});

export default Main;

