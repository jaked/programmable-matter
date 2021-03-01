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
import * as Render from './lang/Render';

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
      port: 3000,
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

      } else {
        note.rendered.depend(this.reload);
        // TODO(jaked) don't blow up on failed notes
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
