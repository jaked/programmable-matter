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

export function computeRanges(path: Path, code: string, language: language) {
  const ranges: Range[] = [];
  let start = 0;

  const addRanges = (parentType: string | undefined, token: Prism.TokenStream) => {
    if (typeof token === 'string') {
      const end = start + token.length;
      if (parentType) {
        ranges.push({
          color: colorOfTokenType(parentType),
          anchor: { path, offset: start },
          focus: { path, offset: end },
        });
      }
      start = end;
    } else if (token instanceof Prism.Token) {
      addRanges(token.type, token.content);
    } else {
      for (const t of token) {
        addRanges(parentType, t);
      }
    }
  }

  const tokens = Prism.tokenize(code, Prism.languages[language])
  addRanges(undefined, tokens);

  return ranges;
}

export function computeChildren(code: string, language: language) {
  const children: React.ReactNode[] = [];

  const addChildren = (parentType: string | undefined, token: Prism.TokenStream) => {
    if (typeof token === 'string') {
      if (parentType) {
        const color = colorOfTokenType(parentType);
        children.push(
          React.createElement(makeStyledSpan(`color: ${color};`), undefined, token)
        );
      } else {
        children.push(token);
      }
    } else if (token instanceof Prism.Token) {
      addChildren(token.type, token.content);
    } else {
      for (const t of token) {
        addChildren(parentType, t);
      }
    }
  }

  const tokens = Prism.tokenize(code, Prism.languages[language])
  addChildren(undefined, tokens);

  return children;
}
