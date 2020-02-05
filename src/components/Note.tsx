import * as React from 'react';
import { Flex as BaseFlex } from 'rebass';
import styled from 'styled-components';

interface Props {
  tag: string,
  icon?: '+' | '-',
  indent: number,
  err: boolean,
  selected: boolean;
  onClick: () => void;
  style: any;
}

const Flex = styled(BaseFlex)`
  :hover {
    cursor: pointer;
  }
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

export const Note = ({ tag, icon, indent, err, selected, onClick, style } : Props) => {
  const backgroundColor =
    err ?
      (selected ? '#cc8080' : '#ffc0c0') :
      (selected ? '#cccccc' : '#ffffff');
  return (
    <Flex
      padding={2}
      backgroundColor={backgroundColor}
      onClick={onClick}
      style={style}
    >
      <div style={{ width: '10px' }}>{icon}</div>
      <div style={{ width: `${indent * 10}px` }} />
      <div>{tag}</div>
    </Flex>
  );
};
