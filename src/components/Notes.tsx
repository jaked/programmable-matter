import * as Path from 'path';

import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import Signal from '../util/Signal';
import * as data from '../data';
import Note from './Note';

// TODO(jaked) make this a global style? or should there be (lighter) outlines?
const Box = styled(BoxBase)({
  outline: 'none',
  height: '100%'
});

type NoteFnProps = {
  index: number,
  style: object,
  data: Props,
}

const NoteFn = React.memo(({ index, style, data }: NoteFnProps) => {
  const note = data.notes[index];
  return <Note
    key={note.name}
    label={Path.parse(note.name).base}
    expanded={note.expanded}
    indent={note.indent}
    err={note.problems}
    selected={note.name === data.selected}
    onSelect={ () => data.onSelect(note.name) }
    toggleDirExpanded={
      typeof note.expanded !== 'undefined' ?
        (() => data.toggleDirExpanded(note.name)) :
        undefined
    }
    onFocusDir={
      typeof note.expanded !== 'undefined' ?
        (() => data.onFocusDir(note.name)) :
        undefined
    }
    style={style}
  />;
});

interface Props {
  notes: Array<data.CompiledNote & { indent: number, expanded?: boolean }>;
  selected: string | null;
  onSelect: (name: string) => void;
  onFocusDir: (name: string | null) => void;
  focusEditor: () => void;
  toggleDirExpanded: (name: string) => void;
}

export default Signal.liftForwardRef<HTMLDivElement, Props>((props, ref) => {
  function nextNote(dir: 'prev' | 'next'): boolean {
    if (props.notes.length === 0) return false;
    let nextNameIndex: number;
    const nameIndex = props.notes.findIndex(note => note.name === props.selected);
    if (nameIndex === -1) {
      nextNameIndex = dir === 'prev' ? (props.notes.length - 1) : 0;
    } else {
      nextNameIndex = (nameIndex + (dir === 'prev' ? -1 : 1));
      if (nextNameIndex === -1) nextNameIndex = props.notes.length - 1;
      else if (nextNameIndex === props.notes.length) nextNameIndex = 0;
    }
    const nextName = props.notes[nextNameIndex].name;
    props.onSelect(nextName);
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
        props.focusEditor();
        return true;

      default: return false;
    }
  }

  // TODO(jaked)
  // this scrolls the list on any render, even if selected item hasn't changed
  const selectedIndex = props.notes.findIndex(note => note.name === props.selected);
  const fixedSizeListRef = React.createRef<FixedSizeList>();
  React.useEffect(() => {
    const current = fixedSizeListRef.current;
    if (current && selectedIndex !== -1) current.scrollToItem(selectedIndex, 'auto');
  });

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
            itemCount={props.notes.length}
            itemSize={30} // TODO(jaked) compute somehow
            width={width}
            height={height}
            itemData={props}
          >
            {NoteFn}
          </FixedSizeList>
        }
      </AutoSizer>
    </Box>
  );
});
