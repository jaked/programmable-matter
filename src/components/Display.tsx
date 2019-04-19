import * as React from 'react';
import MDX from '@mdx-js/runtime';

export class Display extends React.Component<any, any> {
  render() {
    return (
      <MDX>{this.props.content}</MDX>
    );
  }
}
