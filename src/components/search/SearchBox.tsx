import * as React from 'react';
import { Box, Flex } from 'rebass';
import styled from 'styled-components';

import Signal from '../../util/Signal';
import * as Name from '../../util/Name';

import * as App from '../../app';
import * as SelectedNote from '../../app/selectedNote';
import * as Sidebar from '../../app/sidebar';
import * as Focus from '../../app/focus';

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

const SearchBox = () => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const search = Signal.useSignal(Sidebar.searchCell);
  const focusDir = Signal.useSignal(Sidebar.focusDirCell);
  const onNewNote = Signal.useSignal(App.onNewNoteSignal);
  const matchingNotes = Signal.useSignal(Sidebar.matchingNotesSignal);

  // TODO(jaked) useFocus hook?
  const focused = Signal.useSignal(Focus.searchboxFocused);
  React.useEffect(() => {
    const input = inputRef.current;
    if (input) {
      if (focused) {
        input.focus();
        input.setSelectionRange(0, input.value.length);
      }
    }
  }, [focused]);

  const onFocus = () => {
    Focus.focus.setOk('searchbox');
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
      return;

    switch (e.key) {
      case 'ArrowUp':
        Focus.focus.setOk('notes');
        SelectedNote.setSelected(matchingNotes[matchingNotes.length - 1].name);
        e.preventDefault();
        break;

      case 'ArrowDown':
        Focus.focus.setOk('notes');
        SelectedNote.setSelected(matchingNotes[0].name);
        e.preventDefault();
        break;

      case 'Enter':
        const name = focusDir ? Name.join(focusDir, search) : search;
        if (SelectedNote.maybeSetSelected(name)) {
          Focus.focus.setOk('editor');
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
          onFocus={onFocus}
        />
      </InputBox>
      <Button
        onClick={() =>
          inputRef.current && onNewNote(inputRef.current.value)
        }
      >+</Button>
    </OuterBox>
  );
}

export default SearchBox;
