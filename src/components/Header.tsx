import React from 'react';
import { Box, Flex } from 'rebass';
import styled from 'styled-components';
import Signal from '../util/Signal';
import TitleBar from './TitleBar';
import TabBar from './TabBar';

const HeaderBox = styled(Flex)({
  padding: '4px',
  borderBottom: '1px solid #cccccc',
  height: '33px',
});

const TitleBox = styled(Box)({
  flex: 1,
  padding: '2px',
})

type Props = {
  slug: string | null;
  setSlug: (s: string) => void;
  setSelected: (s: string) => void;
  render: () => void;
  editorView: 'mdx' | 'json' | 'table' | 'meta',
  setEditorView: (view: 'mdx' | 'json' | 'table' | 'meta') => void,
  selectedNoteProblems: { meta?: boolean, mdx?: boolean, table?: boolean, json?: boolean } | undefined,
}

export default Signal.lift<Props>(props => {
  if (props.slug === null)
    return <HeaderBox />
  else
    return (
      <HeaderBox>
        <TitleBox>
          <TitleBar
            slug={props.slug}
            setSlug={props.setSlug}
            setSelected={props.setSelected}
            render={props.render}
          />
        </TitleBox>
        <Box>
          <TabBar
            editorView={props.editorView}
            setEditorView={props.setEditorView}
            selectedNoteProblems={props.selectedNoteProblems}
          />
        </Box>
      </HeaderBox>
    );
});
