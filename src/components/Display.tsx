import * as React from 'react';
import MDX from '@mdx-js/runtime';

import { TwitterTweetEmbed } from 'react-twitter-embed';

const components = {
  Tweet: props => <TwitterTweetEmbed {...props} />
}

export class Display extends React.Component<any, any> {
  render() {
    return (
      <MDX components={components}>{this.props.content}</MDX>
    );
  }
}
