import * as React from 'react';
import { Flex, Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

import * as data from '../data';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';
import { SearchBox } from './SearchBox';

interface Props {
  notes: Array<data.Note>;
  selected: string | null;
  search: string;
  content: string | null;
  compiledNote: data.Note | null;
  onSelect: (tag: string | null) => void;
  onSearch: (search: string) => void;
  onChange: (content: string | null) => void;
}

const Box = styled(BoxBase)({
  overflow: 'auto',
}, borders);

export function Main({ notes, selected, search, content, compiledNote, onSelect, onSearch, onChange }: Props) {
  const notesRef = React.createRef<HTMLDivElement>();

  function onKeyDown(key: string): boolean {
    switch (key) {
      case 'ArrowUp':
        notesRef.current && notesRef.current.focus();
        onSelect(notes[notes.length - 1].tag);
        return true;

      case 'ArrowDown':
        notesRef.current && notesRef.current.focus();
        onSelect(notes[0].tag);
        return true;

      case 'Enter':
        return true;

      default: return false;
    }
  }

  return (
    <>
      <Flex style={{ height: '100vh' }}>
        <Box width={1/6}>
          <Flex flexDirection='column'>
            <SearchBox
              search={search}
              onSearch={onSearch}
              onKeyDown={onKeyDown}
            />
            <Notes
              ref={notesRef}
              notes={notes}
              selected={selected}
              onSelect={onSelect}
            />
          </Flex>
        </Box>
        <Box width={5/12} padding={1} borderStyle='solid' borderWidth='0px 0px 0px 1px'>
          <Editor
            content={content}
            compiledNote={compiledNote}
            onChange={onChange}
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
