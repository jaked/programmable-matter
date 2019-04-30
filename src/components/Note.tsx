import * as React from 'react';
import { Box } from 'rebass';

interface Props {
  content: string;
  selected: boolean;
}

interface State {

}

export class Note extends React.Component<Props, State> {
  render() {
    return (
      <Box bg={this.props.selected ? 'gray' : 'white'}>
        {this.props.content}
      </Box>
    );
  }
}