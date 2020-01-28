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
// TODO(jaked)
// ellipsis doesn't work without this
// but it creates some weird scrolling behavior
// overflow-x: hidden;
`;

export const Note = React.forwardRef<HTMLDivElement, Props>(({ note: { tag }, selected, onClick, style }, ref) => {
  return (
    <Box
      ref={ref}
      padding={2}
      backgroundColor={selected ? '#cccccc' : '#ffffff'}
      onClick={onClick}
      style={style}
    >
      {tag}
    </Box>
  );
});
