// Source copied and then modified from
// https://github.com/remarkjs/remark/blob/master/packages/remark-parse/lib/tokenize/html-block.js
//
// MIT License https://github.com/remarkjs/remark/blob/master/license

import * as Babel from '@babel/parser';
import * as ESTree from '../../ESTree';

import { openCloseTag } from './tag';

const tab = '\t'
const space = ' '
const lineFeed = '\n'
const lessThan = '<'

const rawOpenExpression = /^<(script|pre|style)(?=(\s|>|$))/i
const rawCloseExpression = /<\/(script|pre|style)>/i
const commentOpenExpression = /^<!--/
const commentCloseExpression = /-->/
const instructionOpenExpression = /^<\?/
const instructionCloseExpression = /\?>/
const directiveOpenExpression = /^<![A-Za-z]/
const directiveCloseExpression = />/
const cdataOpenExpression = /^<!\[CDATA\[/
const cdataCloseExpression = /\]\]>/
const elementCloseExpression = /^$/
const otherElementOpenExpression = new RegExp(openCloseTag.source + '\\s*$')

function parseExpression(input: string) {
  return Babel.parseExpression(input, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
      'estree'
    ]
  }) as ESTree.Expression;
}

// Babel has no exported way to parse only an atomic expresion
// so we can't stop it from parsing past the end of the JSX expression
// when there is trailing stuff that looks like a compound expression.
// instead we parse it all then find the underlying JSX expression.
function findJsxExpression(ast: ESTree.Expression) {
  switch (ast.type) {
    case 'JSXElement':
    case  'JSXFragment':
      return ast;

    case 'BinaryExpression': return findJsxExpression(ast.left);
    case 'MemberExpression': return findJsxExpression(ast.object);
    case 'CallExpression': return findJsxExpression(ast.callee);

    default: throw new Error('unexpected ast ' + ast.type);
  }
}

function parseJsxExpression(input: string, offset: number) {
  const ast = parseExpression(input);
  return findJsxExpression(ast);
}

export default function blockHtml(eat, value, silent) {
  const blocks = '[a-z\\.]+(\\.){0,1}[a-z\\.]'
  const elementOpenExpression = new RegExp(
    '^</?(' + blocks + ')(?=(\\s|/?>|$))',
    'i'
  )
  const length = value.length
  let index = 0
  let next
  let line
  let offset
  let character
  let count
  let sequence
  let subvalue

  const sequences: Array<[ RegExp, RegExp, boolean ]> = [
    [rawOpenExpression, rawCloseExpression, true],
    [commentOpenExpression, commentCloseExpression, true],
    [instructionOpenExpression, instructionCloseExpression, true],
    [directiveOpenExpression, directiveCloseExpression, true],
    [cdataOpenExpression, cdataCloseExpression, true],
//    [elementOpenExpression, elementCloseExpression, true],
//    [otherElementOpenExpression, elementCloseExpression, false]
  ]

  // Eat initial spacing.
  while (index < length) {
    character = value.charAt(index)

    if (character !== tab && character !== space) {
      break
    }

    index++
  }

  if (value.charAt(index) !== lessThan) {
    return
  }

  next = value.indexOf(lineFeed, index + 1)
  next = next === -1 ? length : next
  line = value.slice(index, next)
  offset = -1
  count = sequences.length

  while (++offset < count) {
    if (sequences[offset][0].test(line)) {
      sequence = sequences[offset]
      break
    }
  }

  if (!sequence) {
    try {
      const ast = parseJsxExpression(value, index);
      const subvalue = value.slice(0, ast.end);
      return eat(subvalue)({type: 'html', value: subvalue})
    } catch (e) {
      if (e.pos) { // see `raise` in Acorn
        // parsing fails if there's additional Markdown after a JSX block
        // so try parsing up to the error location
        try {
          const ast = parseJsxExpression(value.slice(0, e.pos), index);
          const subvalue = value.slice(0, ast.end);
          return eat(subvalue)({type: 'html', value: subvalue});
        } catch (e) {
          return;
        }
      } else {
        return;
      }
    }
  }

  if (silent) {
    return sequence[2]
  }

  index = next

  if (!sequence[1].test(line)) {
    while (index < length) {
      next = value.indexOf(lineFeed, index + 1)
      next = next === -1 ? length : next
      line = value.slice(index + 1, next)

      if (sequence[1].test(line)) {
        if (line) {
          index = next
        }

        break
      }

      index = next
    }
  }

  subvalue = value.slice(0, index)

  return eat(subvalue)({type: 'html', value: subvalue})
}
