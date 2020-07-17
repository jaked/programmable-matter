import * as Http from 'http';
import * as Path from 'path';
import * as Url from 'url';

import BrowserSync from 'browser-sync';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

import * as data from './data';
import * as Name from './util/Name';
import Signal from './util/Signal';
import * as Render from './lang/Render';

export default class Server {
  level: number;
  compiledNotes: Signal<data.CompiledNotes>;
  browserSync: BrowserSync.BrowserSyncInstance;

  constructor(
    compiledNotes: Signal<data.CompiledNotes>
  ) {
    this.handle = this.handle.bind(this);

    this.level = 0;
    this.compiledNotes = compiledNotes;
    this.browserSync = BrowserSync.create();
    this.browserSync.init({
      logLevel: 'silent',
      middleware: this.handle,
      open: false,
      port: 3000,
      notify: false,
    });
  }

  reconcile(level: number) {
    this.compiledNotes.reconcile(this.level)
    this.level = level;

    // TODO(jaked)
    // we reload all pages on every change; should only reload
    // when something a browser is viewing has changed.
    // how can we track what a browser is viewing?
    this.browserSync.reload();
  }

  handle(req: Http.IncomingMessage, res: Http.ServerResponse) {
    let url = Url.parse(req.url || '');
    let path = url.path || '';
    const decodedPath = decodeURIComponent(path.slice(1, path.length));
    const ext = Path.parse(decodedPath).ext;
    let name = Name.nameOfPath(decodedPath);
    // TODO(jaked) temporary hack for the root index note
    if (name === '.') name = '';

    const note = this.compiledNotes.get().get(name);
    if (note) note.meta.reconcile(this.level);
    if (!note || !note.meta.get().publish) {
      res.statusCode = 404;
      res.end(`no note ${name}`);
    } else {
      // TODO(jaked)
      // don't rely on URL here, notes should track their own content type
      if (ext === '.jpeg') {
        note.exportValue.reconcile(this.level);
        const buffer = note.exportValue.get().buffer;
        buffer.reconcile(this.level);
        res.setHeader("Content-Type", "image/jpeg");
        res.end(buffer.get());
      } else {
        // TODO(jaked) don't blow up on failed notes
        note.rendered.reconcile(this.level);
        const node = note.rendered.get();

        const nodeWithContext =
          React.createElement(Render.context.Provider, { value: 'server' }, node)

        // TODO(jaked) compute at note compile time?
        const html = ReactDOMServer.renderToStaticMarkup(nodeWithContext);

        res.setHeader("Content-Type", "text/html; charset=UTF-8")
        res.end(html);
      }
    }
  }
}
