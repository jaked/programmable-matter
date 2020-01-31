import * as React from 'react';
import { Box as BaseBox } from 'rebass';
import styled from 'styled-components';
import * as data from '../data';

interface Props {
  note: data.CompiledNote;
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

export const Note = ({ note: { tag, compiled }, selected, onClick, style } : Props) => {
  const backgroundColor =
    compiled.type === 'err' ?
      (selected ? '#cc8080' : '#ffc0c0') :
      (selected ? '#cccccc' : '#ffffff');
  return (
    <Box
      padding={2}
      backgroundColor={backgroundColor}
      onClick={onClick}
      style={style}
    >
      {tag}
    </Box>
  );
};
