import React from 'react';
import { Box, Flex } from 'rebass';
import styled from 'styled-components';

// TODO(jaked)
// must we use CSS style to get props interpolation?
const TabBox = styled(Box)`
  padding: 4px;
  border-style: solid;
  border-color: #cccccc;
  border-width: 1px ${props => props.rightmost ? '1px' : '0px'} 1px 1px;
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

export default (props: Props) => {
  return (
    <Flex>
      <Tab view={'meta'} {...props} />
      <Tab view={'mdx'} {...props} />
      <Tab view={'json'} {...props} />
      <Tab rightmost={true} view={'table'} {...props} />
    </Flex>
  );
};
