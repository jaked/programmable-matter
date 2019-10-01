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
    this.focusSearchBox = this.focusSearchBox.bind(this);
    this.publishSite = this.publishSite.bind(this);
  }

  componentDidMount() {
    ipc.on('focus-search-box', this.focusSearchBox);
    ipc.on('publish-site', this.publishSite);
  }

  componentWillUnmount() {
    ipc.removeListener('focus-search-box', this.focusSearchBox);
    ipc.removeListener('publish-site', this.publishSite);
  }

  focusSearchBox() {
    this.searchBoxRef.current && this.searchBoxRef.current.focus();
  }

  async publishSite() {
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
      const node = note.compiled.get().rendered();
      const html = ReactDOMServer.renderToStaticMarkup(node as React.ReactElement);
      await mkdir(path.dirname(notePath), { recursive: true });
      await writeFile(notePath, html);
    }).values());
    // TODO(jaked) this opens in Finder
    // maybe should serve locally over HTTP?
    shell.openExternal(`file://${tempdir}`);

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

  render() {
    const { notes, selected, search, content, compiledNote, session, onSelect, onSearch, onChange, saveSession, newNote } = this.props;
    const self = this;

      // TODO(jaked) replace with a bound method
    function onKeyDown(key: string): boolean {
      switch (key) {
        case 'ArrowUp':
          self.notesRef.current && self.notesRef.current.focus();
          onSelect(notes[notes.length - 1].tag);
          return true;

        case 'ArrowDown':
          self.notesRef.current && self.notesRef.current.focus();
          onSelect(notes[0].tag);
          return true;

        case 'Enter':
          if (notes.every(note => note.tag !== search)) {
            newNote(search);
          }
          onSelect(search);
          if (self.editorRef.current) {
            self.editorRef.current.focus();
          }
          return true;

        default: return false;
      }
    }

    return (
      <>
        <Flex style={{ height: '100vh' }}>
          <Flex width={1/6} flexDirection='column'>
            <SearchBox
              ref={this.searchBoxRef}
              search={search}
              onSearch={onSearch}
              onKeyDown={onKeyDown}
            />
            <Box>
              <Notes
                ref={this.notesRef}
                notes={notes}
                selected={selected}
                onSelect={onSelect}
              />
            </Box>
          </Flex>
          <Box width={5/12} padding={1} borderStyle='solid' borderWidth='0px 0px 0px 1px'>
            <Editor
              ref={this.editorRef}
              selected={selected}
              content={content}
              compiledNote={compiledNote}
              session={session}
              onChange={onChange}
              saveSession={saveSession}
            />
          </Box>
          <Box width={5/12} padding={1} borderStyle='solid' borderWidth='0px 0px 0px 1px'>
            <Catch>
              <Display compiledNote={compiledNote} />
            </Catch>
          </Box>
        </Flex>
      </>
    );
  }
}
