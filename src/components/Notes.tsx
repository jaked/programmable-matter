import * as Path from 'path';

import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import * as data from '../data';
import Note from './Note';
import Display from './Display';

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

  return (<Display signal={
    note.problems.map(problems =>
      <Note
        key={note.tag}
        label={Path.parse(note.tag).base}
        expanded={note.expanded}
        indent={note.indent}
        err={problems}
        selected={note.tag === data.selected}
        onSelect={ () => data.onSelect(note.tag) }
        toggleDirExpanded={
          typeof note.expanded !== 'undefined' ?
            (() => data.toggleDirExpanded(note.tag)) :
            undefined
        }
        onFocusDir={
          typeof note.expanded !== 'undefined' ?
            (() => data.onFocusDir(note.tag)) :
            undefined
        }
        style={style}
      />
    )
  } />);
});

interface Props {
  notes: Array<data.CompiledNote & { indent: number, expanded?: boolean }>;
  selected: string | null;
  onSelect: (tag: string) => void;
  onFocusDir: (tag: string | null) => void;
  focusEditor: () => void;
  toggleDirExpanded: (tag: string) => void;
}

export default React.memo(React.forwardRef<HTMLDivElement, Props>((props, ref) => {
  function nextNote(dir: 'prev' | 'next'): boolean {
    if (props.notes.length === 0) return false;
    let nextTagIndex: number;
    const tagIndex = props.notes.findIndex(note => note.tag === props.selected);
    if (tagIndex === -1) {
      nextTagIndex = dir === 'prev' ? (props.notes.length - 1) : 0;
    } else {
      nextTagIndex = (tagIndex + (dir === 'prev' ? -1 : 1));
      if (nextTagIndex === -1) nextTagIndex = props.notes.length - 1;
      else if (nextTagIndex === props.notes.length) nextTagIndex = 0;
    }
    const nextTag = props.notes[nextTagIndex].tag;
    props.onSelect(nextTag);
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
  const selectedIndex = props.notes.findIndex(note => note.tag === props.selected);
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
}));
