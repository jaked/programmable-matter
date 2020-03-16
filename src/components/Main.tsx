import React from 'react';
import { Flex as FlexBase, Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

import { App } from '../app';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';

interface Props {
  app: App;
}

const Box = styled(BoxBase)({
  overflow: 'auto',
}, borders);

const Flex = styled(FlexBase)({
}, borders);

export class Main extends React.Component<Props, {}> {
  sidebarRef = React.createRef<Sidebar>();
  editorRef = React.createRef<Editor>();

  focusSearchBox = () => {
    this.sidebarRef.current && this.sidebarRef.current.focusSearchBox();
  }

  focusEditor = (): void => {
    this.editorRef.current && this.editorRef.current.focus();
  }

  SidebarPane = ({ width }: { width: number }) =>
    <Flex width={width} flexDirection='column'>
      <Sidebar
        ref={this.sidebarRef}
        focusDir={this.props.app.focusDir}
        onFocusDir={this.props.app.setFocusDir}
        search={this.props.app.search}
        onSearch={this.props.app.setSearch}
        notes={this.props.app.notes}
        matchingNotes={this.props.app.matchingNotesTree}
        selected={this.props.app.selected}
        onSelect={this.props.app.setSelected}
        newNote={this.props.app.newNote}
        focusEditor={this.focusEditor}
        toggleDirExpanded={this.props.app.toggleDirExpanded}
      />
    </Flex>

  EditorPane = ({ width }: { width: number }) => {
    if (this.props.app.selected !== null &&
        this.props.app.content !== null &&
        this.props.app.compiledNote !== null &&
        this.props.app.view) {
      return (
        <Flex
          flexDirection='column'
          justifyContent='space-between'
          width={width}
          borderColor='#cccccc'
          borderStyle='solid'
          borderWidth='0px 0px 0px 1px'
        >
          <Flex
            flexDirection='column'
          >
            <TabBar
              editorView={this.props.app.editorView}
              setEditorView={this.props.app.setEditorView}
              compiledNote={this.props.app.compiledNote}
            />
            <Box
              padding={1}
            >
              <Editor
                  ref={this.editorRef}
                  selected={this.props.app.selected}
                  view={this.props.app.view}
                  content={this.props.app.content}
                  compiledNote={this.props.app.compiledNote}
                  session={this.props.app.session}
                  onChange={this.props.app.setContentAndSession}
                  setStatus={this.props.app.setStatus}
                  setSelected={this.props.app.setSelected}
              />
            </Box>
          </Flex>
          <div style={{ backgroundColor: '#ffc0c0' }}>{this.props.app.status}</div>
        </Flex>
      );
    } else {
      return (
        <Flex
          width={width}
          padding={1}
          borderColor='#cccccc'
          borderStyle='solid'
          borderWidth='0px 0px 0px 1px'
        >
          no note
        </Flex>
      );
    }
  }

  DisplayPane = ({ width }: { width: number }) =>
    <Box
      width={width}
      padding={1}
      borderColor='#cccccc'
      borderStyle='solid'
      borderWidth='0px 0px 0px 1px'
    >
      <Catch>
        <Display compiledNote={this.props.app.compiledNote} />
      </Catch>
    </Box>

  render() {
    const [sideBarWidth, mainPaneWidth] =
      this.props.app.sideBarVisible ? [ 1/6, 5/6 ] : [ 0, 1 ];
    const [editorPaneWidth, displayPaneWidth] = (
      this.props.app.mainPaneView === 'code' ? [1, 0] :
      this.props.app.mainPaneView === 'display' ? [0, 1] :
      /* this.props.app.mainPaneView === 'split' ? */ [1/2, 1/2]
    ).map(w => w * mainPaneWidth);

    return (
      <>
        <Flex style={{ height: '100vh' }}>
          { sideBarWidth === 0 ? null : <this.SidebarPane width={sideBarWidth} /> }
          { editorPaneWidth === 0 ? null : <this.EditorPane width={editorPaneWidth} /> }
          { displayPaneWidth === 0 ? null : <this.DisplayPane width={displayPaneWidth} /> }
        </Flex>
      </>
    );
  }
}
