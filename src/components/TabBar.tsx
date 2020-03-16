import React from 'react';
import { Box as BoxBase, Flex as FlexBase } from 'rebass';
import styled from 'styled-components';

const Bar = styled(FlexBase)({
  paddingTop: '4px'
});

const UnselectedTab = styled(BoxBase)({
  padding: '5px 5px 4px 5px',
  borderBottom: '1px solid #cccccc'
});

const SelectedTab = styled(BoxBase)({
  padding: '4px',
  borderColor: '#cccccc',
  borderStyle: 'solid',
  borderWidth: '1px 1px 0px 1px'
});

type TabProps = {
  view: 'mdx' | 'json' | 'table' | 'meta',
  editorView: 'mdx' | 'json' | 'table' | 'meta',
  setEditorView: (view: 'mdx' | 'json' | 'table' | 'meta') => void,
}

const Tab = (props: TabProps) => {
  if (props.editorView === props.view) {
    return <SelectedTab>{props.view}</SelectedTab>;
  } else {
    return <UnselectedTab onClick={() => props.setEditorView(props.view)}>{props.view}</UnselectedTab>;
  }
}

type Props = {
  editorView: 'mdx' | 'json' | 'table' | 'meta',
  setEditorView: (view: 'mdx' | 'json' | 'table' | 'meta') => void,
}

export const TabBar = (props: Props) => {
  return <Bar>
    <UnselectedTab />
    <Tab view={'meta'} editorView={props.editorView} setEditorView={props.setEditorView} />
    <Tab view={'mdx'} editorView={props.editorView} setEditorView={props.setEditorView} />
    <Tab view={'json'} editorView={props.editorView} setEditorView={props.setEditorView} />
    <Tab view={'table'} editorView={props.editorView} setEditorView={props.setEditorView} />
    <UnselectedTab style={{ width: '100%' }} />
  </Bar>;
}
