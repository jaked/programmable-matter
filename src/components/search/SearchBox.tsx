import * as React from 'react';
import { Box, Flex } from 'rebass';
import styled from 'styled-components';
import Signal from '../../util/Signal';

type Props = {
  focusDir: string | null,
  setFocusDir: (focusDir: string | null) => void,
  search: string,
  onSearch: (search: string) => void,
  onKeyDown: (e: React.KeyboardEvent) => void,
  onNewNote: (name: string) => void,
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

const SearchBox = Signal.liftForwardRef<SearchBox, Props>((props, ref) => {
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(ref, () => ({
    focus: () => {
      const input = inputRef.current;
      if (input) {
        input.setSelectionRange(0, input.value.length)
        input.focus();
      }
    }
  }));

  const { focusDir, setFocusDir, search, onSearch, onKeyDown, onNewNote } = props;
  return (
    <OuterBox>
      { focusDir ? <FocusDir onClick={() => setFocusDir(null)}>{focusDir + '/'}</FocusDir> : null }
      <InputBox>
        <Input
          ref={inputRef}
          type='text'
          maxLength={100}
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            e.preventDefault();
            onSearch(e.currentTarget.value);
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
