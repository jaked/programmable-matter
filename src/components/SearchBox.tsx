import * as React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import { borders } from 'styled-system';

type Props = {
  search: string,
  onSearch: (search: string) => void,
}

const Input = styled.input({
  boxSizing: 'border-box',
  borderStyle: 'none',
  outline: 'none',
  fontSize: '14px',
});

const Box = styled(BoxBase)({}, borders);

export function SearchBox({ search, onSearch}: Props) {
  return (
    <Box width={1} padding={1}>
      <Box width={1} padding={1} borderWidth={1} borderStyle='solid'>
        <Input
          width={1}
          type='text'
          maxLength={100}
          value={search}
          onChange={ (e: React.ChangeEvent<HTMLInputElement>) => {
            onSearch(e.currentTarget.value);
          } }
        />
      </Box>
    </Box>
  );
}
