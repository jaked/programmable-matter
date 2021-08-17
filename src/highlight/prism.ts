import React from 'react';
import Prism from 'prismjs';
// TODO(jaked) load on demand
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-typescript';
import { Path } from 'slate';

import { language } from '../pmast';
import { Range } from './types';
import colorOfTokenType from './colorOfTokenType';
import makeStyledSpan from './makeStyledSpan';

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

export function computeRanges(path: Path, code: string, language: language) {
  const ranges: Range[] = [];
  let start = 0

  const tokens = Prism.tokenize(code, Prism.languages[language])
  for (const token of tokens) {
    const length = getLength(token)
    const end = start + length

    if (typeof token !== 'string') {
      ranges.push({
        color: colorOfTokenType(token.type),
        anchor: { path, offset: start },
        focus: { path, offset: end },
      })
    }

    start = end
  }

  return ranges;
}

export function computeChildren(code: string, language: language) {
  const children: React.ReactNode[] = [];
  const tokens = Prism.tokenize(code, Prism.languages[language])
  for (const token of tokens) {
    const content = getContent(token);

    if (typeof token === 'string') {
      children.push(token);
    } else {
      const color = colorOfTokenType(token.type);
      children.push(React.createElement(makeStyledSpan(`color: ${color};`), undefined, content));
    }
  }
  return children;
}
