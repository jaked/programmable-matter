import * as React from 'react';
import { Flex, Box } from 'rebass';

import * as data from '../data';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';
import { Notes } from './Notes';

interface Props {
  notes: data.Notes;
  selected: string | null;
  content: string | null;
  compiledNote: data.Note | null;
  onSelect: (tag: string | null) => void;
  onChange: (content: string | null) => void;
}

export function Main({ notes, selected, content, compiledNote, onSelect, onChange }: Props) {
  return (
    <>
      <Flex style={{ height: '100vh' }}>
        <Box width={1/6}>
          <Notes
            notes={notes}
            selected={selected}
            onSelect={onSelect}
          />
        </Box>
        <Box width={5/12}>
          <Editor
            content={content}
            compiledNote={compiledNote}
            onChange={onChange}
          />
        </Box>
        <Box width={5/12}>
          <Catch>
            <Display compiledNote={compiledNote} />
          </Catch>
        </Box>
      </Flex>
    </>
  );
}
