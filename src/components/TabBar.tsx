import React from 'react';
import { Box as BoxBase, Flex as FlexBase } from 'rebass';
import styled from 'styled-components';
import * as data from '../data';

const BarBox = styled(FlexBase)({
  paddingLeft: '4px',
  paddingTop: '4px',
  width: '100%',
  borderBottom: '1px solid #cccccc'
});

// TODO(jaked)
// must we use CSS style to get props interpolation?
const TabBox = styled(BoxBase)`
  padding: 4px;
  border-style: solid
  border-color: #cccccc
  border-width: 1px ${props => props.rightmost ? '1px' : '0px'} 0px 1px
`;

type Props = {
  editorView: 'mdx' | 'json' | 'table' | 'meta',
  setEditorView: (view: 'mdx' | 'json' | 'table' | 'meta') => void,
  selectedNoteProblems: { meta?: boolean, mdx?: boolean, table?: boolean, json?: boolean } | undefined,
}

type TabProps = Props & {
  view: 'mdx' | 'json' | 'table' | 'meta',
  rightmost?: boolean
}

const Tab = (props: TabProps) => {
  const selected = props.editorView === props.view;
  const problems = props.selectedNoteProblems && props.selectedNoteProblems[props.view];

  const backgroundColor =
    problems ?
      (selected ? '#cc8080' : '#ffc0c0') :
      (selected ? '#cccccc' : '#ffffff');
  const onClick = selected ? () => { } : () => props.setEditorView(props.view)

  return (
    <TabBox
      backgroundColor={backgroundColor}
      rightmost={props.rightmost}
      onClick={onClick}
    >
      {props.view}
    </TabBox>
  );
}

export const TabBar = (props: Props) => {
  return <BarBox>
    <Tab view={'meta'} {...props} />
    <Tab view={'mdx'} {...props} />
    <Tab view={'json'} {...props} />
    <Tab rightmost={true} view={'table'} {...props} />
  </BarBox>;
}
