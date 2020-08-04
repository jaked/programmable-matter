import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import * as Name from '../../util/Name';
import Signal from '../../util/Signal';
import * as data from '../../data';
import Note from './Note';

import { NoteTree } from './Sidebar';

// TODO(jaked) make this a global style? or should there be (lighter) outlines?
const Box = styled(BoxBase)({
  outline: 'none',
  height: '100%'
});

type EntryFnProps = {
  index: number,
  style: object,
  data: Props,
}

const EntryFn = React.memo(({ index, style, data }: EntryFnProps) => {
  const entry = data.entries[index];
  if (entry.type === 'note') {
    return <Note
      key={entry.note.name}
      label={Name.basename(entry.note.name)}
      indent={entry.indent}
      err={entry.note.problems}
      selected={entry.note.name === data.selected}
      onSelect={ () => data.onSelect(entry.note.name) }
      style={style}
    />;
  } else {
    return <Note
      key={entry.name}
      label={Name.basename(entry.name)}
      expanded={entry.expanded}
      indent={entry.indent}
      err={false}
      selected={false}
      onSelect={ () => { } }
      toggleDirExpanded={ () => data.toggleDirExpanded(entry.name) }
      onFocusDir={ () => data.onFocusDir(entry.name) }
      style={style}
    />;
  }
});

interface Props {
  entries: NoteTree;
  selected: string | null;
  onSelect: (name: string) => void;
  onFocusDir: (name: string | null) => void;
  focusEditor: () => void;
  toggleDirExpanded: (name: string) => void;
}

export default Signal.liftForwardRef<HTMLDivElement, Props>((props, ref) => {
  function nextNote() {
    const length = props.entries.length;
    let currIndex = props.entries.findIndex(note => note.type === 'note' && note.note.name === props.selected);
    for (let i = 1; i < length; i++) {
      const entry = props.entries[(currIndex + i) % length];
      if (entry.type === 'note') {
        props.onSelect(entry.note.name);
        return;
      }
    }
  }

  function prevNote() {
    const length = props.entries.length;
    let currIndex = props.entries.findIndex(note => note.type === 'note' && note.note.name === props.selected);
    if (currIndex === -1) currIndex = length;
    for (let i = 1; i < length; i++) {
      const entry = props.entries[(length + currIndex - i) % length];
      if (entry.type === 'note') {
        props.onSelect(entry.note.name);
        return;
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent): boolean {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
      return false;

    switch (e.key) {
      case 'ArrowUp':
        prevNote();
        return true;

      case 'ArrowDown':
        nextNote();
        return true;

      case 'Enter':
        props.focusEditor();
        return true;

      default: return false;
    }
  }

  const selectedIndex = props.entries.findIndex(note => note.type === 'note' && note.note.name === props.selected);
  const fixedSizeListRef = React.createRef<FixedSizeList>();
  React.useEffect(() => {
    const current = fixedSizeListRef.current;
    if (current && selectedIndex !== -1) current.scrollToItem(selectedIndex, 'auto');
  }, [ props.selected ]);

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
            itemCount={props.entries.length}
            itemSize={30} // TODO(jaked) compute somehow
            width={width}
            height={height}
            itemData={props}
          >
            {EntryFn}
          </FixedSizeList>
        }
      </AutoSizer>
    </Box>
  );
});
