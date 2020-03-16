import React from 'react';
import { Box as BoxBase, Flex as FlexBase } from 'rebass';
import styled from 'styled-components';
import * as data from '../data';

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

type Props = {
  editorView: 'mdx' | 'json' | 'table' | 'meta',
  setEditorView: (view: 'mdx' | 'json' | 'table' | 'meta') => void,
  compiledNote: data.CompiledNote,
}

type TabProps = Props & {
  view: 'mdx' | 'json' | 'table' | 'meta',
}

const Tab = (props: TabProps) => {
  const selected = props.editorView === props.view;
  const compiled = props.compiledNote.compiled[props.view];
  let problems: boolean = false;
  if (compiled) {
    if (compiled.value.type === 'err') problems = true;
    else if (compiled.value.ok.problems) problems = true;
  }
  const backgroundColor =
    problems ?
      (selected ? '#cc8080' : '#ffc0c0') :
      (selected ? '#cccccc' : '#ffffff');

  if (props.editorView === props.view) {
    return <SelectedTab backgroundColor={backgroundColor}>{props.view}</SelectedTab>;
  } else {
    return <UnselectedTab backgroundColor={backgroundColor} onClick={() => props.setEditorView(props.view)}>{props.view}</UnselectedTab>;
  }
}

export const TabBar = (props: Props) => {
  return <Bar>
    <UnselectedTab />
    <Tab view={'meta'} {...props} />
    <Tab view={'mdx'} {...props} />
    <Tab view={'json'} {...props} />
    <Tab view={'table'} {...props} />
    <UnselectedTab style={{ width: '100%' }} />
  </Bar>;
}
