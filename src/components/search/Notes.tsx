import React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import * as Name from '../../util/Name';
import Signal from '../../util/Signal';
import * as data from '../../data';
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
  const entry = data.notes[index];
  return <Note
    key={entry.name}
    label={Name.basename(entry.name)}
    err={entry.problems}
    selected={entry.name === data.selected}
    onSelect={ () => data.onSelect(entry.name) }
    style={style}
  />;
});

interface Props {
  notes: data.CompiledNote[];
  selected: string | null;
  onSelect: (name: string) => void;
  focusEditor: () => void;
}

export default Signal.liftForwardRef<HTMLDivElement, Props>((props, ref) => {
  function nextNote() {
    const length = props.notes.length;
    let currIndex = props.notes.findIndex(note => note.name === props.selected);
    const note = props.notes[(currIndex + 1) % length];
    props.onSelect(note.name);
  }

  function prevNote() {
    const length = props.notes.length;
    let currIndex = props.notes.findIndex(note => note.name === props.selected);
    if (currIndex === -1) currIndex = length;
    const note = props.notes[(length + currIndex - 1) % length];
    props.onSelect(note.name);
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

  const selectedIndex = props.notes.findIndex(note => note.name === props.selected);
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
