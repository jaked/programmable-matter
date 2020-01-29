import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import * as data from '../data';
import { Note } from './Note';

// TODO(jaked) make this a global style? or should there be (lighter) outlines?
const Box = styled(BoxBase)({
  outline: 'none',
  height: '100%'
});

interface Props {
  notes: Array<data.Note>;
  selected: string | null;
  onSelect: (tag: string) => void;
  focusEditor: () => void;
}

export const Notes = React.forwardRef<HTMLDivElement, Props>(({ notes, selected, onSelect, focusEditor }, ref) => {
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

  function onKeyDown(e: React.KeyboardEvent): boolean {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
      return false;

    switch (e.key) {
      case 'ArrowUp':
        return nextNote('prev');

      case 'ArrowDown':
        return nextNote('next');

      case 'Enter':
        focusEditor();
        return true;

      default: return false;
    }
  }

  // TODO(jaked)
  // this scrolls the list on any render, even if selected item hasn't changed
  const selectedIndex = notes.findIndex(note => note.tag === selected);
  const fixedSizeListRef = React.createRef<FixedSizeList>();
  React.useEffect(() => {
    const current = fixedSizeListRef.current;
    if (current && selectedIndex !== -1) current.scrollToItem(selectedIndex, 'auto');
  });

  const Notes = ({ index, style }: { index: number, style: any }) => {
    const note = notes[index];
    return (
      <Note
        key={note.tag}
        note={note}
        selected={note.tag === selected}
        onClick={ () => onSelect(note.tag) }
        style={style}
      />
    );
  };

  return (
    <Box
      ref={ref}
      tabIndex='0'
      onKeyDown={(e: React.KeyboardEvent) => {
        if (onKeyDown(e))
          e.preventDefault();
      }}
    >
      <AutoSizer>
        {({ height, width }) =>
          <FixedSizeList
            ref={fixedSizeListRef}
            itemCount={notes.length}
            itemSize={30} // TODO(jaked) compute somehow
            width={width}
            height={height}
          >
            {Notes}
          </FixedSizeList>
        }
      </AutoSizer>
    </Box>
  );
});
