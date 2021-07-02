import * as React from 'react';
import { Box, Flex } from 'rebass';
import styled from 'styled-components';

import Signal from '../../util/Signal';
import * as Name from '../../util/Name';

import * as App from '../../app';
import * as SelectedNote from '../../app/selectedNote';
import * as Sidebar from '../../app/sidebar';

type Props = {
  focusNotes: () => void;
  focusEditor: () => void;
}

const FocusDir = styled(Box)`
  white-space: nowrap;
  font-size: small;
  :hover {
    cursor: pointer;
  }
`;

const Input = styled.input({
  padding: '2px',
  boxSizing: 'border-box',
  borderStyle: 'none',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  width: '100%',
});

const OuterBox = styled(Flex)({
  padding: '4px',
  borderBottom: '1px solid #cccccc',
  alignItems: 'center',
});

const InputBox = styled(Box)({
  flex: 1,
  minWidth: 0,
});

const Button = styled(Box)`
  font-family: inherit;
  font-size: inherit;
  outline: none;
  background-color: #ffffff;
  padding: 2px 4px 2px 4px;
  border-style: solid;
  border-color: #cccccc;
  border-width: 1px;
  :hover {
    cursor: pointer;
  }
`;
Button.defaultProps = {
  as: 'button'
}

type SearchBox = {
  focus: () => void
};

const SearchBox = React.forwardRef<SearchBox, Props>((props, ref) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const search = Signal.useSignal(Sidebar.searchCell);
  const focusDir = Signal.useSignal(Sidebar.focusDirCell);
  const onNewNote = Signal.useSignal(App.onNewNoteSignal);
  const matchingNotes = Signal.useSignal(Sidebar.matchingNotesSignal);

  React.useImperativeHandle(ref, () => ({
    focus: () => {
      const input = inputRef.current;
      if (input) {
        input.setSelectionRange(0, input.value.length)
        input.focus();
      }
    }
  }));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
      return;

    switch (e.key) {
      case 'ArrowUp':
        props.focusNotes();
        SelectedNote.setSelected(matchingNotes[matchingNotes.length - 1].name);
        e.preventDefault();
        break;

      case 'ArrowDown':
        props.focusNotes();
        SelectedNote.setSelected(matchingNotes[0].name);
        e.preventDefault();
        break;

      case 'Enter':
        const name = focusDir ? Name.join(focusDir, search) : search;
        if (SelectedNote.maybeSetSelected(name)) {
          props.focusEditor();
        } else {
          onNewNote(name);
        }
        e.preventDefault();
        break;
    }
  };

  return (
    <OuterBox>
      { focusDir &&
        <FocusDir
          onClick={() => Sidebar.setFocusDir(null)}
        >{focusDir + '/'}</FocusDir> }
      <InputBox>
        <Input
          ref={inputRef}
          type='text'
          maxLength={100}
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            e.preventDefault();
            Sidebar.setSearch(e.currentTarget.value);
          }}
          onKeyDown={onKeyDown}
        />
      </InputBox>
      <Button
        onClick={() =>
          inputRef.current && onNewNote(inputRef.current.value)
        }
      >+</Button>
    </OuterBox>
  );
});

export default SearchBox;
