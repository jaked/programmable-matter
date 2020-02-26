import isAlphabetical from 'is-alphabetical';
import { isImport, isExport, EMPTY_NEWLINE } from '@mdx-js/util';
import block from './block';
import { tag } from './tag';

const LESS_THAN = '<'
const GREATER_THAN = '>'
const SLASH = '/'
const EXCLAMATION = '!'

import * as Babel from '@babel/parser';
import * as ESTree from '../../ESTree';

tokenizeEsSyntax.locator = tokenizeEsSyntaxLocator

export default function mdx(this: any, _options) {
  const parser = this.Parser

  if (parser && parser.prototype && parser.prototype.blockTokenizers) {
    attachParser(parser)
  }
}

export function parseExpression(input: string) {
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

function attachParser(parser) {
  const blocks = parser.prototype.blockTokenizers
  const inlines = parser.prototype.inlineTokenizers
  const methods = parser.prototype.blockMethods

  blocks.esSyntax = tokenizeEsSyntax
  blocks.html = wrap(block)
  inlines.html = wrap(inlines.html, inlineJsx);

  (<any>tokenizeEsSyntax).notInBlock = true

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
      const ast = parseJsxExpression(value, 0);
      const subvalue = value.slice(0, ast.end);
      return eat(subvalue)({type: 'jsx', value: subvalue})
    } catch (e) {
      if (e.pos) { // see `raise` in Acorn
        // parsing fails if there's additional Markdown after a JSX block
        // so try parsing up to the error location
        try {
          const ast = parseJsxExpression(value.slice(0, e.pos), 0);
          const subvalue = value.slice(0, ast.end);
          return eat(subvalue)({type: 'jsx', value: subvalue});
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