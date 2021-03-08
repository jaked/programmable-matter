import * as Http from 'http';
import * as Path from 'path';
import * as Url from 'url';

import BrowserSync from 'browser-sync';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

import { bug } from './util/bug';
import * as model from './model';
import * as Name from './util/Name';
import Signal from './util/Signal';
import * as ESTree from './lang/ESTree';
import * as Parse from './lang/Parse';
import * as Render from './lang/Render';
import * as PMAST from './model/PMAST';

const e = (el: string, attrs: {}, ...children: string[]) =>
  `React.createElement(${el}, {}, ${children.join(', ')})`

function evaluateExpression(
  ast: ESTree.Expression
): string {
  switch (ast.type) {
    case 'Identifier':
      return ast.name;

      case 'Literal':
      return JSON.stringify(ast.value);

    case 'BinaryExpression': {
      const left = evaluateExpression(ast.left);
      const right = evaluateExpression(ast.right);
      return `(${left} ${ast.operator} ${right})`;
    }

    case 'ConditionalExpression': {
      const test = evaluateExpression(ast.test);
      const consequent = evaluateExpression(ast.consequent);
      const alternate = evaluateExpression(ast.alternate);
      return `(${test} ? ${consequent} : ${alternate})`;
    }

    default:
      throw new Error('unimplemented');
  }
}

export function renderNode(
  node: PMAST.Node,
  decls: string[],
): string {
  if ('text' in node) {
    let text: string = JSON.stringify(node.text);
    if (node.bold)          text = e(`'strong'`, {}, text);
    if (node.italic)        text = e(`'em'`, {}, text);
    if (node.underline)     text = e(`'u'`, {}, text);
    if (node.strikethrough) text = e(`'del'`, {}, text);
    if (node.subscript)     text = e(`'sub'`, {}, text);
    if (node.superscript)   text = e(`'sup'`, {}, text);
    if (node.code)          text = e(`'code'`, {}, text);
    return e(`'span'`, {}, text);
  } else {
    if (node.type === 'code') {
      if (!(node.children.length === 1)) bug('expected 1 child');
      const child = node.children[0];
      if (!(PMAST.isText(child))) bug('expected text');
      try {
        const children: string[] = [];
        const ast = Parse.parseProgram(child.text);
        for (const node of ast.body) {
          switch (node.type) {
            case 'ExpressionStatement':
              children.push(evaluateExpression(node.expression));
              break;

            case 'VariableDeclaration': {
              switch (node.kind) {
                case 'const': {
                  for (const declarator of node.declarations) {
                    const name = declarator.id.name;
                    const value = evaluateExpression(declarator.init);
                    decls.push(`const ${name} = ${value};`);
                  }
                }
              }
              break;
            }

            default:
              throw new Error('unimplemented');
          }
        }
        return e('React.Fragment', {}, ...children);
      } catch (e) {
        return 'null';
      }
    } else if (node.type === 'inlineCode') {
      if (!(node.children.length === 1)) bug('expected 1 child');
      const child = node.children[0];
      if (!(PMAST.isText(child))) bug('expected text');
      try {
        const ast = Parse.parseExpression(child.text);
        return evaluateExpression(ast);
      } catch (e) {
        return 'null';
      }

    } else {
      const children = node.children.map(child => renderNode(child, decls));
      return e(`'${node.type}'`, {}, ...children);
    }
  }
}

export default class Server {
  compiledNotes: Signal<model.CompiledNotes>;
  browserSync: BrowserSync.BrowserSyncInstance;

  constructor(
    compiledNotes: Signal<model.CompiledNotes>
  ) {
    this.handle = this.handle.bind(this);

    this.compiledNotes = compiledNotes;
    this.browserSync = BrowserSync.create();
    // TODO(jaked) takes a readiness callback, should use it?
    this.browserSync.init({
      logLevel: 'silent',
      middleware: this.handle,
      online: false,
      open: false,
      notify: false,
      port: 3001,
      ui: false,
    });
  }

  reload = { dirty: () => this.browserSync.reload () }

  handle(req: Http.IncomingMessage, res: Http.ServerResponse) {
    let url = Url.parse(req.url || '');
    let path = url.path || '';
    const decodedPath = decodeURIComponent(path);
    const ext = Path.parse(decodedPath).ext;
    const name = Name.nameOfPath(decodedPath);

    const note = this.compiledNotes.get().get(name);
    if (!note || !note.meta.get().publish) {
      res.statusCode = 404;
      res.end(`no note ${name}`);
    } else {
      // TODO(jaked)
      // don't rely on URL here, notes should track their own content type

      if (ext === '.jpeg') {
        const buffer = note.exportValue.get().get('buffer') ?? bug(`expected buffer`);
        res.setHeader("Content-Type", "image/jpeg");
        res.end(buffer.get());

      } else if (ext === '.png') {
          const buffer = note.exportValue.get().get('buffer') ?? bug(`expected buffer`);
          res.setHeader("Content-Type", "image/png");
          res.end(buffer.get());

      } else if (ext === '.xml') {
        note.rendered.depend(this.reload);
        // TODO(jaked) don't blow up on failed notes
        const xml = note.rendered.get();

        res.setHeader("Content-Type", "application/rss+xml");
        res.end(xml)

      } else if (ext === '.html' || ext === '') {
        note.rendered.depend(this.reload);
        // TODO(jaked) don't blow up on failed notes
        const node = note.rendered.get();

        const nodeWithContext =
          React.createElement(Render.context.Provider, { value: 'server' }, node)

        // TODO(jaked) compute at note compile time?
        const html = ReactDOMServer.renderToStaticMarkup(nodeWithContext);
        const script = `<script type='module' src='${name}.js'></script>`

        res.setHeader("Content-Type", "text/html; charset=UTF-8")
        res.write(script);
        res.write(`<div id='root'>` + html + '</div>');
        res.end();

      } else if (ext === '.js') {
        const pmContent = note.files.pm?.content.get() as model.PMContent;
        const decls: string[] = []
        const nodes = pmContent.nodes.map(node => renderNode(node, decls));
        const element = e('React.Fragment', {}, ...nodes);

        const script = `
import React from 'https://cdn.skypack.dev/pin/react@v17.0.1-yH0aYV1FOvoIPeKBbHxg/mode=imports/optimized/react.js';
import ReactDOM from 'https://cdn.skypack.dev/pin/react-dom@v17.0.1-N7YTiyGWtBI97HFLtv0f/mode=imports/optimized/react-dom.js';

${decls.join('\n')}
const __element = ${element};
const __container = document.getElementById('root');

ReactDOM.hydrate(__element, __container);
`
        res.setHeader("Content-Type", "text/javascript; charset=UTF-8");
        res.write(script);
        res.end();
      } else {
        res.statusCode = 404;
        res.end();
      }
    }
  }
}
