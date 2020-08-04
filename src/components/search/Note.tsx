import * as React from 'react';
import { Box as BoxBase } from 'rebass';
import styled from 'styled-components';
import Signal from '../../util/Signal';

interface Props {
  label: string,
  err: boolean,
  selected: boolean;
  onSelect: () => void;
  style: any;
}

const Box = styled(BoxBase)`
  :hover {
    cursor: pointer;
  }
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

export default Signal.lift<Props>(({ label, err, selected, onSelect, style }) => {
  const backgroundColor =
    err ?
      (selected ? '#cc8080' : '#ffc0c0') :
      (selected ? '#cccccc' : '#ffffff');

  return (
    <Box
      padding={2}
      backgroundColor={backgroundColor}
      style={style}
      onClick={onSelect}
    >
      {label}
    </Box>
  );
});
