import * as React from 'react';
import { Flex as BaseFlex } from 'rebass';
import styled from 'styled-components';
import Signal from '../util/Signal';

interface Props {
  label: string,
  expanded?: boolean,
  indent: number,
  err: boolean,
  selected: boolean;
  onSelect: () => void;
  toggleDirExpanded?: () => void;
  onFocusDir?: () => void;
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

export default Signal.lift<Props>(({ label, expanded, indent, err, selected, onSelect, toggleDirExpanded, onFocusDir, style }) => {
  const backgroundColor =
    err ?
      (selected ? '#cc8080' : '#ffc0c0') :
      (selected ? '#cccccc' : '#ffffff');
  const icon = (typeof expanded === 'undefined') ? undefined :
               expanded ? '-' : '+';

  const onClick = (e: React.MouseEvent) => {
    if (e.altKey && onFocusDir) onFocusDir();
    else onSelect();
  }

  return (
    <Flex
      padding={2}
      backgroundColor={backgroundColor}
      style={style}
      onClick={onClick}
    >
      <div style={{ minWidth: `${indent * 10}px` }} />
      <div onClick={e => { toggleDirExpanded && toggleDirExpanded(); e.stopPropagation() }} style={{ minWidth: '10px' }}>{icon}</div>
      <div>{label}</div>
    </Flex>
  );
});
