import React from 'react';
import { Flex as FlexBase, Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

import { App } from '../app';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';
import { SearchBox } from './SearchBox';

interface Props {
  app: App;
}

const Box = styled(BoxBase)({
  overflow: 'auto',
}, borders);

const Flex = styled(FlexBase)({
}, borders);

export class Main extends React.Component<Props, {}> {
  notesRef = React.createRef<HTMLDivElement>();
  editorRef = React.createRef<Editor>();
  searchBoxRef = React.createRef<SearchBox>();

  constructor(props: Props) {
    super(props);
  }

  focusSearchBox = () => {
    this.searchBoxRef.current && this.searchBoxRef.current.focus();
  }

  onKeyDown = (e: React.KeyboardEvent): boolean => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
      return false;

    switch (e.key) {
      case 'ArrowUp':
        this.notesRef.current && this.notesRef.current.focus();
        this.props.app.setSelected(this.props.app.matchingNotes[this.props.app.matchingNotes.length - 1].tag);
        return true;

      case 'ArrowDown':
        this.notesRef.current && this.notesRef.current.focus();
        this.props.app.setSelected(this.props.app.matchingNotes[0].tag);
        return true;

      case 'Enter':
        if (this.props.app.matchingNotes.every(note => note.tag !== this.props.app.search)) {
          this.props.app.newNote(this.props.app.search);
        }
        this.props.app.setSelected(this.props.app.search);
        if (this.editorRef.current) {
          this.editorRef.current.focus();
        }
        return true;

      default: return false;
    }
  }

  focusEditor = (): void => {
    if (this.editorRef.current) {
      this.editorRef.current.focus();
    }
  }

  SideBar = ({ width }: { width: number }) =>
    <Flex width={width} flexDirection='column'>
      <SearchBox
        ref={this.searchBoxRef}
        search={this.props.app.search}
        onSearch={this.props.app.setSearch}
        onKeyDown={this.onKeyDown}
      />
      <Notes
        ref={this.notesRef}
        notes={this.props.app.matchingNotes}
        selected={this.props.app.selected}
        onSelect={this.props.app.setSelected}
        focusEditor={this.focusEditor}
      />
    </Flex>

  EditorPane = ({ width }: { width: number }) =>
    <Flex
      flexDirection='column'
      justifyContent='space-between'
      width={width}
      padding={1}
      borderColor='#cccccc'
      borderStyle='solid'
      borderWidth='0px 0px 0px 1px'
    >
      <Box>
        <Editor
          ref={this.editorRef}
          selected={this.props.app.selected}
          content={this.props.app.content}
          parsedNote={this.props.app.highlightValid ? this.props.app.compiledNote : null}
          session={this.props.app.session}
          onChange={this.props.app.setContentAndSession}
          setStatus={this.props.app.setStatus}
        />
      </Box>
      <div style={{ backgroundColor: '#ffc0c0' }}>{this.props.app.status}</div>
    </Flex>

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
          { sideBarWidth === 0 ? null : <this.SideBar width={sideBarWidth} /> }
          { editorPaneWidth === 0 ? null : <this.EditorPane width={editorPaneWidth} /> }
          { displayPaneWidth === 0 ? null : <this.DisplayPane width={displayPaneWidth} /> }
        </Flex>
      </>
    );
  }
}
