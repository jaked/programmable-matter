import * as React from 'react';
import MDX from '@mdx-js/runtime';

const components = {
  h1: props => <h1 style={{ color: 'tomato' }} {...props} />
}

const scope = {
  Demo: props => <h1>This is a demo component</h1>
}

const mdx = `
# Hello, world!
<Demo />
`

export const Display = () => (
  <MDX components={components} scope={scope}>{mdx}</MDX>
)
