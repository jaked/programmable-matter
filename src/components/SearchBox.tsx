import * as React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import Signal from '../util/Signal';

type Props = {
  search: string,
  onSearch: (search: string) => void,
  onKeyDown: (e: React.KeyboardEvent) => boolean,
}

const Input = styled.input({
  boxSizing: 'border-box',
  borderStyle: 'none',
  outline: 'none',
  fontSize: '14px',
  width: '100%',
});

const Box = styled(BoxBase)({
  padding: '6px',
  borderBottom: '1px solid #cccccc',
});

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

  const { search, onSearch, onKeyDown } = props;
  return (
    <Box>
      <Input
        ref={inputRef}
        type='text'
        maxLength={100}
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          e.preventDefault();
          onSearch(e.currentTarget.value);
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (onKeyDown(e))
            e.preventDefault();
        }}
      />
    </Box>
  );
});

export default SearchBox;
