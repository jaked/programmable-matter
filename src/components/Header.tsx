import React from 'react';
import { Box, Flex } from 'rebass';
import styled from 'styled-components';
import Signal from '../util/Signal';
import TitleBar from './TitleBar';

import * as SelectedNote from '../app/selectedNote';

const HeaderBox = styled(Flex)({
  padding: '4px',
  borderBottom: '1px solid #cccccc',
  height: '33px',
});

const TitleBox = styled(Box)({
  flex: 1,
  padding: '2px',
})

export default () => {
  const name = Signal.useSignal(SelectedNote.selectedNote);

  if (name === null)
    return <HeaderBox />
  else
    return (
      <HeaderBox>
        <TitleBox>
          <TitleBar />
        </TitleBox>
      </HeaderBox>
    );
};
