import * as Acorn from 'acorn';
import AcornJsx from 'acorn-jsx';

import isAlphabetical from 'is-alphabetical';
import block from './block';
import { tag } from './tag';

const JsxParser = Acorn.Parser.extend(AcornJsx())

const IMPORT_REGEX = /^import/
const EXPORT_REGEX = /^export/
const EMPTY_NEWLINE = '\n\n'
const LESS_THAN = '<'
const GREATER_THAN = '>'
const SLASH = '/'
const EXCLAMATION = '!'

const isImport = (text: string) => IMPORT_REGEX.test(text)
const isExport = (text: string) => EXPORT_REGEX.test(text)

tokenizeEsSyntax.locator = tokenizeEsSyntaxLocator

export default function mdx(this: any, _options) {
  const parser = this.Parser

  if (parser && parser.prototype && parser.prototype.blockTokenizers) {
    attachParser(parser)
  }
}

function parseExprAtom(input: string, offset: number) {
  const parser = new JsxParser({}, input, 0) as any;
  parser.nextToken();
  return parser.parseExprAtom();
}

function attachParser(parser) {
  const blocks = parser.prototype.blockTokenizers
  const inlines = parser.prototype.inlineTokenizers
  const methods = parser.prototype.blockMethods

  blocks.esSyntax = tokenizeEsSyntax
  blocks.html = wrap(block)
  inlines.html = wrap(inlines.html, inlineJsx)

  methods.splice(methods.indexOf('paragraph'), 0, 'esSyntax')

  function wrap(original, customTokenizer?) {
    const tokenizer = customTokenizer || tokenizeJsx
    tokenizer.locator = original.locator

    return tokenizer

    function tokenizeJsx(this: any) {
      const node = original.apply(this, arguments)

      if (node) {
        node.type = 'jsx'
      }

      return node
    }
  }

  function inlineJsx(eat, value) {
    if (value.charAt(0) !== LESS_THAN) {
      return
    }

    const nextChar = value.charAt(1)
    if (
      nextChar !== GREATER_THAN &&
      nextChar !== SLASH &&
      nextChar !== EXCLAMATION &&
      !isAlphabetical(nextChar)
    ) {
      return
    }

    try {
      const ast = parseExprAtom(value, 0);
      const subvalue = value.slice(0, ast.end);
      return eat(subvalue)({type: 'jsx', value: subvalue})
    } catch (e) {
      if (e.pos) { // see `raise` in Acorn
        // parsing fails if there's additional Markdown after a JSX block
        // so try parsing up to the error location
        try {
          const ast = parseExprAtom(value.slice(0, e.pos), 0);
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
}

function tokenizeEsSyntax(eat, value) {
  const index = value.indexOf(EMPTY_NEWLINE)
  const subvalue = index !== -1 ? value.slice(0, index) : value

  if (isExport(subvalue)) {
    eat(subvalue)({ type: 'export', value: subvalue });
  } else if (isImport(subvalue)) {
    eat(subvalue)({ type: 'import', value: subvalue });
  }
}

function tokenizeEsSyntaxLocator(value, _fromIndex) {
  return isExport(value) || isImport(value) ? -1 : 1
}
