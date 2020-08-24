import React from 'react';
import { Box as BoxBase, Flex as FlexBase } from 'rebass';
import styled from 'styled-components';
import { FixedSizeList } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import * as Name from '../../util/Name';
import Signal from '../../util/Signal';
import * as data from '../../data';

// TODO(jaked) make this a global style? or should there be (lighter) outlines?
const Box = styled(BoxBase)({
  outline: 'none',
  height: '100%'
});

const Label = styled(BoxBase)`
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
  data: Props,
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

interface Props {
  notes: data.CompiledNote[];
  selected: string | null;
  onSelect: (name: string) => void;
  focusDir: string | null;
  onFocusDir: (name: string | null) => void;
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
