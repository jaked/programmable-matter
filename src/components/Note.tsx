import * as React from 'react';
import { Box as BaseBox } from 'rebass';
import styled from 'styled-components';

interface Props {
  tag: string,
  err: boolean,
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

export const Note = ({ tag, err, selected, onClick, style } : Props) => {
  const backgroundColor =
    err ?
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
