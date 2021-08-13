import React from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import { Path } from 'slate';

import { Range, tag } from './types';
import components from './components';

const getLength = token => {
  if (typeof token === 'string') {
    return token.length
  } else if (typeof token.content === 'string') {
    return token.content.length
  } else {
    return token.content.reduce((l, t) => l + getLength(t), 0)
  }
}

const getContent = token => {
  if (typeof token === 'string') {
    return token
  } else if (typeof token.content === 'string') {
    return token.content
  } else {
    return token.content.reduce((l, t) => l + getContent(t), '')
  }
}

const highlightTagOfTokenType = (type: string): tag => {
  switch (type) {
    case 'keyword': return 'keyword';
    case 'number': return 'number';
    case 'string': return 'string';
    case 'boolean': return 'atom';
    case 'function-variable': return 'definition';
    case 'builtin': return 'variable';

    case 'operator': return 'default';
    case 'punctuation': return 'default';

    default:
      return 'default';
  }
}

export function computeRanges(path: Path, code: string, language: 'javascript' | 'typescript') {
  const ranges: Range[] = [];
  let start = 0

  const tokens = Prism.tokenize(code, Prism.languages[language])
  for (const token of tokens) {
    const length = getLength(token)
    const end = start + length

    if (typeof token !== 'string') {
      ranges.push({
        highlight: highlightTagOfTokenType(token.type),
        anchor: { path, offset: start },
        focus: { path, offset: end },
      })
    }

    start = end
  }

  return ranges;
}

export function computeChildren(code: string, language: 'javascript' | 'typescript') {
  const children: React.ReactNode[] = [];
  const tokens = Prism.tokenize(code, Prism.languages[language])
  for (const token of tokens) {
    const content = getContent(token);

    if (typeof token === 'string') {
      children.push(token);
    } else {
      const highlight = highlightTagOfTokenType(token.type);
      const component = components[highlight];
      children.push(React.createElement(component, undefined, content));
    }
  }
  return children;
}
