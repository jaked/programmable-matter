import React from 'react';
import { Flex as FlexBase, Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

import { bug } from '../util/bug';

import { App } from '../app';

import { Catch } from './Catch';
import Display from './Display';
import Editor from './Editor';
import Sidebar from './Sidebar';
import { TabBar } from './TabBar';

interface Props {
  app: App;
}

const Box = styled(BoxBase)({
  height: '100%',
  overflow: 'auto',
}, borders);

const Flex = styled(FlexBase)({
}, borders);

type SidebarPaneProps = {
  app: App;
  width: number;
  focusEditor: () => void;
};

const SidebarPane = React.forwardRef<Sidebar, SidebarPaneProps>((props, ref) =>
  <Flex width={props.width} flexDirection='column'>
    <Sidebar
      ref={ref}
      focusDir={props.app.focusDir}
      onFocusDir={props.app.setFocusDir}
      search={props.app.search}
      onSearch={props.app.setSearch}
      matchingNotes={props.app.matchingNotesTree}
      selected={props.app.selected}
      onSelect={props.app.setSelected}
      newNote={props.app.newNote}
      focusEditor={props.focusEditor}
      toggleDirExpanded={props.app.toggleDirExpanded}
    />
  </Flex>
);

type EditorPaneProps = {
  app: App;
  width: number;
}

const EditorPane = React.forwardRef<Editor, EditorPaneProps>((props, ref) => {
  // TODO(jaked) better way to handle discharging null case
  const compiledFileSignal = props.app.compiledFileSignal.map(compiledFile =>
    compiledFile ?? bug('')
  );

  return (
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
          editorView={props.app.editorView}
          setEditorView={props.app.setEditorView}
          selectedNoteProblems={props.app.selectedNoteProblems}
        />
        <Box
          padding={1}
        >{
          (props.app.content !== null &&
          props.app.compiledFile !== null) ?
            <Editor
              ref={ref}
              view={props.app.editorView}
              content={props.app.content}
              compiledFile={compiledFileSignal}
              session={props.app.session}
              onChange={props.app.setContentAndSession}
              setStatus={props.app.setStatus}
              setSelected={props.app.setSelected}
            /> :
            <Box
              padding={1}
            >
              no note
            </Box>
        }</Box>
      </Flex>
      <div style={{ backgroundColor: '#ffc0c0' }}>{props.app.status}</div>
    </Flex>
  );
});

type DisplayPaneProps = {
  app: App;
  width: number;
}

const DisplayPane = (props: DisplayPaneProps) =>
  <Box
    width={props.width}
    padding={1}
    borderColor='#cccccc'
    borderStyle='solid'
    borderWidth='0px 0px 0px 1px'
  >{
    props.app.compiledNote ?
      <Display signal={props.app.compiledNote.rendered} /> :
      'no note'
  }</Box>

type Main = {
  focusSearchBox: () => void;
}

const Main = React.forwardRef<Main, Props>((props, ref) => {
  const sidebarRef = React.useRef<Sidebar>(null);
  const editorRef = React.useRef<Editor>(null);

  const focusEditor = () => {
    editorRef.current && editorRef.current.focus();
  }

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
          <SidebarPane
            ref={sidebarRef}
            app={props.app}
            width={sideBarWidth}
            focusEditor={focusEditor}
          />
        </Catch>
      }
      { editorPaneWidth === 0 ? null :
        <Catch>
          <EditorPane
            ref={editorRef}
            app={props.app}
            width={editorPaneWidth}
          />
        </Catch>
      }
      { displayPaneWidth === 0 ? null :
        <Catch>
          <DisplayPane
            app={props.app}
            width={displayPaneWidth}
          />
        </Catch>
      }
    </Flex>
  );
});

export default Main;

