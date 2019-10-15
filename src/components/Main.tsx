import * as Immutable from 'immutable';

import { ipcRenderer as ipc, remote, shell } from 'electron';
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
import { Flex, Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

import * as data from '../data';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import * as RSCEditor from './react-simple-code-editor';
import { Notes } from './Notes';
import { SearchBox } from './SearchBox';

interface Props {
  sideBarVisible: boolean;
  toggleSideBarVisible: () => void;
  notes: Array<data.Note>;
  selected: string | null;
  search: string;
  content: string | null;
  compiledNote: data.Note | null;
  session: RSCEditor.Session;
  onSelect: (tag: string | null) => void;
  onSearch: (search: string) => void;
  onChange: (content: string | null) => void;
  saveSession: (session: RSCEditor.Session) => void;
  newNote: (tag: string) => void;

  // TODO(jaked) for site build, move elsewhere
  notesPath: string;
  compiledNotes: Immutable.Map<string, data.Note>;
}

const Box = styled(BoxBase)({
  overflow: 'auto',
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
    ipc.on('publish-site', this.publishSite);
    ipc.on('toggle-side-bar-visible', this.toggleSideBarVisible);
  }

  componentWillUnmount() {
    ipc.removeListener('focus-search-box', this.focusSearchBox);
    ipc.removeListener('publish-site', this.publishSite);
    ipc.removeListener('toggle-side-bar-visible', this.toggleSideBarVisible);
  }

  focusSearchBox = () => {
    this.searchBoxRef.current && this.searchBoxRef.current.focus();
  }

  publishSite = async () => {
    const { compiledNotes } = this.props;
    // TODO(jaked) generate random dir name?
    const tempdir = path.resolve(remote.app.getPath("temp"), 'programmable-matter');
    // fs.rmdir(tempdir, { recursive: true }); // TODO(jaked) Node 12.10.0
    await rimraf(tempdir, { glob: false })
    await mkdir(tempdir);
    await writeFile(path.resolve(tempdir, '.nojekyll'), '');
    await Promise.all(compiledNotes.map(async note => {
      const notePath = path.resolve(tempdir, path.relative(this.props.notesPath, note.path)) + '.html';
      if (!note.compiled) { throw new Error('expected compiled note') }
      const node = note.compiled.get().rendered();  // TODO(jaked) fix Try.get()
      const html = ReactDOMServer.renderToStaticMarkup(node as React.ReactElement);
      await mkdir(path.dirname(notePath), { recursive: true });
      await writeFile(notePath, html);
    }).values());
    // TODO(jaked) this opens in Finder
    // maybe should serve locally over HTTP?
    shell.openExternal(`file://${tempdir}`);

    if (false) {
      await publish(tempdir, {
        src: '**',
        dotfiles: true,
        branch: 'master',
        repo: 'https://github.com/jaked/symmetrical-rotary-phone.git',
        message: 'published from Programmable Matter',
        name: 'Jake Donham',
        email: 'jake.donham@gmail.com',
      });
    }
  }

  toggleSideBarVisible = () => {
    this.props.toggleSideBarVisible();
  }

  onKeyDown = (key: string): boolean => {
    switch (key) {
      case 'ArrowUp':
        this.notesRef.current && this.notesRef.current.focus();
        this.props.onSelect(this.props.notes[this.props.notes.length - 1].tag);
        return true;

      case 'ArrowDown':
        this.notesRef.current && this.notesRef.current.focus();
        this.props.onSelect(this.props.notes[0].tag);
        return true;

      case 'Enter':
        if (this.props.notes.every(note => note.tag !== this.props.search)) {
          this.props.newNote(this.props.search);
        }
        this.props.onSelect(this.props.search);
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
        search={this.props.search}
        onSearch={this.props.onSearch}
        onKeyDown={this.onKeyDown}
      />
      <Box>
        <Notes
          ref={this.notesRef}
          notes={this.props.notes}
          selected={this.props.selected}
          onSelect={this.props.onSelect}
        />
      </Box>
    </Flex>

  EditorPane = ({ width }: { width: number }) =>
    <Box width={width} padding={1} borderStyle='solid' borderWidth='0px 0px 0px 1px'>
      <Editor
        ref={this.editorRef}
        selected={this.props.selected}
        content={this.props.content}
        compiledNote={this.props.compiledNote}
        session={this.props.session}
        onChange={this.props.onChange}
        saveSession={this.props.saveSession}
      />
    </Box>

  DisplayPane = ({ width }: { width: number }) =>
    <Box width={width} padding={1} borderStyle='solid' borderWidth='0px 0px 0px 1px'>
      <Catch>
        <Display compiledNote={this.props.compiledNote} />
      </Catch>
    </Box>

  render() {
    if (this.props.sideBarVisible) {
      return (
        <>
          <Flex style={{ height: '100vh' }}>
            <this.SideBar width={1/6} />
            <this.EditorPane width={5/12} />
            <this.DisplayPane width={5/12} />
          </Flex>
        </>
      );
    } else {
      return (
        <>
          <Flex style={{ height: '100vh' }}>
            <this.EditorPane width={1/2} />
            <this.DisplayPane width={1/2} />
          </Flex>
        </>
      );
    }
  }
}
