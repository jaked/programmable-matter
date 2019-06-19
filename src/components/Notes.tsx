import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import * as data from '../data';
import { Note } from './Note';

// TODO(jaked) make this a global style? or should there be (lighter) outlines?
const Box = styled(BoxBase)({
  outline: 'none'
});

interface Props {
  notes: data.Notes;
  selected: string | null;
  onSelect: (tag: string) => void;
}

export function Notes({ notes, selected, onSelect }: Props) {
  const notesArray = notes.valueSeq().toArray();

  function nextNote(prev: boolean): boolean {
    if (notesArray.length === 0) return false;
    let nextTagIndex: number;
    const tagIndex = notesArray.findIndex(note => note.tag === selected);
    if (tagIndex === -1) {
      nextTagIndex = prev ? (notesArray.length - 1) : 0;
    } else {
      nextTagIndex = (tagIndex + (prev ? -1 : 1));
      if (nextTagIndex === -1) nextTagIndex = notesArray.length - 1;
      else if (nextTagIndex === notesArray.length) nextTagIndex = 0;
    }
    const nextTag = notesArray[nextTagIndex].tag;
    onSelect(nextTag);
    return true;
  }

  function onKeyPress(key: string): boolean {
    console.log(`Notes.onKeyPress(${key})`)
    switch (key) {
      case 'ArrowUp':
        return nextNote(true);

      case 'ArrowDown':
        return nextNote(false);

      default: return false;
    }
  }

  return (
    <Box
      tabIndex='0'
      // TODO(jaked) onKeyPress doesn't work, why not?
      onKeyDown={(e: React.KeyboardEvent) => {
        if (onKeyPress(e.key))
          e.preventDefault();
      }}
    >
      {notesArray.map((note) =>
        <Note
          key={note.tag}
          note={note}
          selected={note.tag === selected}
          onClick={ () => onSelect(note.tag) }
        />
      )}
    </Box>
  );
}
