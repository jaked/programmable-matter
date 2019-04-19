import * as React from 'react';
import { Box, Flex } from 'rebass';

import { Editor } from './Editor';
import { Display } from './Display';

export class Main extends React.Component<any, any> {
  render() {
    return (
      <Flex>
        <Box width={1/2} css={{ height: '100vh' }}>
          <Editor />
        </Box>
        <Box width={1/2} css={{ height: '100vh' }}>
          <Display />
        </Box>
      </Flex>
    );
  }
}
