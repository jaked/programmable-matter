import * as React from 'react';
import { Box as BaseBox } from 'rebass';
import styled from 'styled-components';
import * as data from '../data';

interface Props {
  note: data.Note;
  selected: boolean;
  onClick: () => void;
}

const Box = styled(BaseBox)`
  :hover { background-color: #cccccc; }
`;

export const Note: React.FunctionComponent<Props> =
  function({ note: { tag, content }, selected, onClick }) {
    return (
      <Box
        width={1}
        padding={2}
        backgroundColor={selected ? '#888888' : '#ffffff'}
        onClick={onClick}
      >
        {tag}
      </Box>
    );
  }
