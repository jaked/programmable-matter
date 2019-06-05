// Source copied and then modified from
// https://github.com/remarkjs/remark/blob/master/packages/remark-parse/lib/tokenize/html-block.js
//
// MIT License https://github.com/remarkjs/remark/blob/master/license

import * as Acorn from 'acorn';
import AcornJsx from 'acorn-jsx';

import { openCloseTag } from './tag';

const jsxParser = Acorn.Parser.extend(AcornJsx())

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
      const ast = jsxParser.parseExpressionAt(value, index);
      const subvalue = value.slice(0, ast.end);
      return eat(subvalue)({type: 'html', value: subvalue})
    } catch (e) {
      if (e.pos) { // see `raise` in Acorn
        // parsing fails if there's additional Markdown after a JSX block
        // so try parsing up to the error location
        try {
          const ast = jsxParser.parseExpressionAt(value.slice(0, e.pos), index);
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
