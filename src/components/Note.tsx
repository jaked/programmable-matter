import * as React from 'react';
import { Box as BaseBox } from 'rebass';
import styled from 'styled-components';
import * as data from '../data';

interface Props {
  note: data.Note;
  selected: boolean;
  onClick: () => void;
  style: any;
}

const Box = styled(BaseBox)`
  :hover {
    cursor: pointer;
  }
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

export const Note = ({ note: { tag }, selected, onClick, style } : Props) => {
  return (
    <Box
      padding={2}
      backgroundColor={selected ? '#cccccc' : '#ffffff'}
      onClick={onClick}
      style={style}
    >
      {tag}
    </Box>
  );
};
