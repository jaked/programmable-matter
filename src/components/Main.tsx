import * as React from 'react';
import { Box, Flex } from 'rebass';
import styled from 'styled-components';

import { Editor } from './Editor';
import { Display } from './Display';

const FullHeightBox = styled(Box)`
  height: 100vh
`;

export class Main extends React.Component<any, any> {
  render() {
    return (
      <Flex>
        <FullHeightBox width={1/2}>
          <Editor />
        </FullHeightBox>
        <FullHeightBox width={1/2}>
          <Display />
        </FullHeightBox>
      </Flex>
    );
  }
}
