import React from 'react';
import { Box as BoxBase, Flex as FlexBase } from 'rebass';
import styled from 'styled-components';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import * as Name from '../util/Name';
import Signal from '../util/Signal';
import * as model from '../model';

import * as SelectedNote from '../app/selectedNote';
import * as Sidebar from '../app/sidebar';
import * as Focus from '../app/focus';

// TODO(jaked) make this a global style? or should there be (lighter) outlines?
const Box = styled(BoxBase)({
  outline: 'none',
  height: '100%'
});

const Label = styled(BoxBase)`
  flex: 1;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

const SubLabel = styled(BoxBase)`
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  padding-left: 10px;
  font-size: small;
`;

const Flex = styled(FlexBase)`
  :hover {
    cursor: pointer;
  }
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  align-items: center;
`;


type NoteFnProps = {
  index: number,
  style: object,
  data: {
    notes: model.CompiledNote[],
    selected: string | null,
    onSelect: (s: string | null) => void,
    focusDir: string | null,
    onFocusDir: (s: string | null) => void,
  },
}

const NoteFn = React.memo(({ index, style, data }: NoteFnProps) => {
  const note = data.notes[index];
  const selected = note.name === data.selected;
  const err = Signal.useSignal(note.problems);
  const backgroundColor =
    err ?
      (selected ? '#cc8080' : '#ffc0c0') :
      (selected ? '#cccccc' : '#ffffff');
  const dirname = Name.dirname(note.name);
  const focusDir = data.focusDir ? data.focusDir : '/';
  const dirLabel = Name.relative(focusDir, dirname);

  return (
    <Flex
      key={note.name}
      padding={2}
      backgroundColor={backgroundColor}
      style={style}
    >
      <Label onClick={() => data.onSelect(note.name)}>{Name.basename(note.name)}</Label>
      { dirLabel ? <SubLabel onClick={() => data.onFocusDir(Name.dirname(note.name))}>{dirLabel}</SubLabel> : null }
    </Flex>
  );
});

// if you click on notes from editor
// we must enforce notes focus
// or else the focus is still editor and doesn't change
// when you select a note
// TODO(jaked) do this in a more uniform way
const onFocus = () => Focus.focusNotes();

const Notes = () => {
  const selected = Signal.useSignal(SelectedNote.selectedNote);
  const focusDir = Signal.useSignal(Sidebar.focusDirCell);
  const notes = Signal.useSignal(Sidebar.matchingNotesSignal);
  const onSelect = SelectedNote.setSelected;
  const onFocusDir = Sidebar.setFocusDir;

  const boxRef = React.useRef<typeof Box>(null);
  // TODO(jaked) useFocus hook?
  const focused = Signal.useSignal(Focus.notesFocused);
  React.useEffect(() => {
    const box = boxRef.current;
    if (box) {
      if (focused) {
        box.focus();
      }
    }
  }, [focused]);

  function nextNote() {
    const length = notes.length;
    let currIndex = notes.findIndex(note => note.name === selected);
    const note = notes[(currIndex + 1) % length];
    onSelect(note.name);
  }

  function prevNote() {
    const length = notes.length;
    let currIndex = notes.findIndex(note => note.name === selected);
    if (currIndex === -1) currIndex = length;
    const note = notes[(length + currIndex - 1) % length];
    onSelect(note.name);
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
        Focus.focusEditor();
        return true;

      default: return false;
    }
  }

  const selectedIndex = notes.findIndex(note => note.name === selected);
  const fixedSizeListRef = React.createRef<FixedSizeList>();
  React.useEffect(() => {
    const current = fixedSizeListRef.current;
    if (current && selectedIndex !== -1) current.scrollToItem(selectedIndex, 'auto');
  }, [ selected ]);

  return (
    <Box
      ref={boxRef}
      tabIndex='0'
      onKeyDown={(e: React.KeyboardEvent) => {
        if (onKeyDown(e))
          e.preventDefault();
      }}
      onFocus={onFocus}
    >
      <AutoSizer>
        {({ height, width }) =>
          <FixedSizeList
            ref={fixedSizeListRef}
            itemCount={notes.length}
            itemSize={30} // TODO(jaked) compute somehow
            width={width}
            height={height}
            itemData={{ notes, selected, focusDir, onSelect, onFocusDir }}
          >
            {NoteFn}
          </FixedSizeList>
        }
      </AutoSizer>
    </Box>
  );
};

export default Notes;
