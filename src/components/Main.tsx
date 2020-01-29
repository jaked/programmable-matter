import { ipcRenderer as ipc, remote } from 'electron';
import fs from 'fs';
import path from 'path';
import util from 'util';
import rimrafCallback from 'rimraf';
import ghPages from 'gh-pages';
const rimraf = util.promisify(rimrafCallback);
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const publish = util.promisify(ghPages.publish);

import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { Flex as FlexBase, Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

import { App } from '../app';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';
import { SearchBox } from './SearchBox';

import * as GTasks from '../integrations/gtasks';

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

  componentDidMount() {
    ipc.on('focus-search-box', this.focusSearchBox);
    ipc.on('toggle-side-bar-visible', this.props.app.toggleSideBarVisible);
    ipc.on('set-main-pane-view-code', this.setMainPaneViewCode);
    ipc.on('set-main-pane-view-display', this.setMainPaneViewDisplay);
    ipc.on('set-main-pane-view-split', this.setMainPaneViewSplit);

    ipc.on('publish-site', this.publishSite);
    ipc.on('sync-google-tasks', this.syncGoogleTasks);
  }

  componentWillUnmount() {
    ipc.removeListener('focus-search-box', this.focusSearchBox);
    ipc.removeListener('toggle-side-bar-visible', this.props.app.toggleSideBarVisible);
    ipc.removeListener('set-main-pane-view-code', this.setMainPaneViewCode);
    ipc.removeListener('set-main-pane-view-display', this.setMainPaneViewDisplay);
    ipc.removeListener('set-main-pane-view-split', this.setMainPaneViewSplit);

    ipc.removeListener('publish-site', this.publishSite);
    ipc.removeListener('sync-google-tasks', this.syncGoogleTasks);
  }

  focusSearchBox = () => {
    this.searchBoxRef.current && this.searchBoxRef.current.focus();
  }

  setMainPaneViewCode = () => this.props.app.setMainPaneView('code');
  setMainPaneViewDisplay = () => this.props.app.setMainPaneView('display');
  setMainPaneViewSplit = () => this.props.app.setMainPaneView('split');

  publishSite = async () => {
    // TODO(jaked) generate random dir name?
    const tempdir = path.resolve(remote.app.getPath("temp"), 'programmable-matter');
    // fs.rmdir(tempdir, { recursive: true }); // TODO(jaked) Node 12.10.0
    await rimraf(tempdir, { glob: false })
    await mkdir(tempdir);
    await writeFile(path.resolve(tempdir, '.nojekyll'), '');
    await writeFile(path.resolve(tempdir, 'CNAME'), "jaked.org");
    await Promise.all(this.props.app.compiledNotes.map(async note => {
      // TODO(jaked) figure out file extensions
      if (note.type === 'jpeg') {
        const notePath = path.resolve(tempdir, note.path);
        await mkdir(path.dirname(notePath), { recursive: true });
        await writeFile(notePath, note.buffer);
      } else if (note.type === 'table') {
        // ???
      } else {
        const notePath = path.resolve(tempdir, note.path) + '.html';
        const node = note.compiled.get().rendered.get();  // TODO(jaked) fix Try.get()
        const html = ReactDOMServer.renderToStaticMarkup(node as React.ReactElement);
        await mkdir(path.dirname(notePath), { recursive: true });
        await writeFile(notePath, html);
      }
    }).values());
    if (true) {
      await publish(tempdir, {
        src: '**',
        dotfiles: true,
        branch: 'master',
        repo: 'https://github.com/jaked/jaked.github.io.git',
        message: 'published from Programmable Matter',
        name: 'Jake Donham',
        email: 'jake.donham@gmail.com',
      });
    }
  }

  syncGoogleTasks = () => {
    // TODO(jaked) should do this via Filesystem object
    // not via direct filesystem accesss
    const filesPath = fs.realpathSync(path.resolve(process.cwd(), 'docs'));
    GTasks.authAndSyncTaskLists(filesPath);
  }

  onKeyDown = (key: string): boolean => {
    switch (key) {
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
