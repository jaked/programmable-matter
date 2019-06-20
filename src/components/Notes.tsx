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
  notes: Array<data.Note>;
  selected: string | null;
  onSelect: (tag: string) => void;
}

export const Notes = React.forwardRef<HTMLDivElement, Props>(({ notes, selected, onSelect }, ref) => {
  function nextNote(dir: 'prev' | 'next'): boolean {
    if (notes.length === 0) return false;
    let nextTagIndex: number;
    const tagIndex = notes.findIndex(note => note.tag === selected);
    if (tagIndex === -1) {
      nextTagIndex = dir === 'prev' ? (notes.length - 1) : 0;
    } else {
      nextTagIndex = (tagIndex + (dir === 'prev' ? -1 : 1));
      if (nextTagIndex === -1) nextTagIndex = notes.length - 1;
      else if (nextTagIndex === notes.length) nextTagIndex = 0;
    }
    const nextTag = notes[nextTagIndex].tag;
    onSelect(nextTag);
    return true;
  }

  function onKeyDown(key: string): boolean {
    switch (key) {
      case 'ArrowUp':
        return nextNote('prev');

      case 'ArrowDown':
        return nextNote('next');

      default: return false;
    }
  }

  return (
    <Box
      ref={ref}
      tabIndex='0'
      onKeyDown={(e: React.KeyboardEvent) => {
        if (onKeyDown(e.key))
          e.preventDefault();
      }}
    >
      {notes.map((note) =>
        <Note
          key={note.tag}
          note={note}
          selected={note.tag === selected}
          onClick={ () => onSelect(note.tag) }
        />
      )}
    </Box>
  );
});
