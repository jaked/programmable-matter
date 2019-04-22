import * as React from 'react';
import { Box, Flex } from 'rebass';
import styled from 'styled-components';

import { Catch } from './Catch';
import { Display } from './Display';
import { Editor } from './Editor';

const FullHeightBox = styled(Box)`
  height: 100vh
`;

interface State {
  content: string;
}

export class Main extends React.Component<{}, State> {
  state = {
    content: '# Hello World'
  }

  handleChange = content => {
    this.setState({ content })
  }

  render() {
    const { content } = this.state
    return (
      <Flex>
        <FullHeightBox width={1/2}>
          <Editor content={content} onChange={this.handleChange} />
        </FullHeightBox>
        <FullHeightBox width={1/2}>
          <Catch>
            <Display content={content} />
          </Catch>
        </FullHeightBox>
      </Flex>
    );
  }
}
