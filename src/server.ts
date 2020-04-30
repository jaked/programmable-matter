import * as Http from 'http';
import * as Path from 'path';
import * as Url from 'url';

import BrowserSync from 'browser-sync';
import ReactDOMServer from 'react-dom/server';

import * as data from './data';
import Signal from './util/Signal';
import Trace from './util/Trace';

export default class Server {
  level: number;
  trace: Trace;
  files: Signal<data.Files>;
  compiledNotes: Signal<data.CompiledNotes>;
  browserSync: BrowserSync.BrowserSyncInstance;

  constructor(
    trace: Trace,
    files: Signal<data.Files>,
    compiledNotes: Signal<data.CompiledNotes>
  ) {
    this.handle = this.handle.bind(this);

    this.level = 0;
    this.trace = trace;
    this.files = files;
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

  reconcile(trace: Trace, level: number) {
    this.files.reconcile(this.trace, this.level);
    this.compiledNotes.reconcile(this.trace, this.level)
    this.level = level;

    // TODO(jaked)
    // for now this is always called from app.render() and we always reload
    // we should only reload when something relevant has changed
    // how do we track which pages browsers are looking at?
    this.browserSync.reload();
  }

  handle(req: Http.IncomingMessage, res: Http.ServerResponse) {
    let url = Url.parse(req.url || '');
    let path = url.path || '';
    const decodedPath = decodeURIComponent(path.slice(1, path.length));
    const pathParts = Path.parse(decodedPath);
    const tag = Path.join(pathParts.dir, pathParts.name)

    if (pathParts.ext === '.jpeg') {
      // TODO(jaked)
      // figure out a better way to plumb this
      // it could go through the note but then we need to make sure it is reconciled
      const file = this.files.get().get(`${tag}.jpeg`);
      if (!file) {
        res.statusCode = 404;
        res.end(`no file ${tag}.jpeg`);
      } else {
        const buffer = file.bufferCell.get();
        res.setHeader("Content-Type", "image/jpeg");
        res.end(buffer);
      }
    } else {
      const note = this.compiledNotes.get().get(tag);
      if (!note) {
        res.statusCode = 404;
        res.end(`no note ${tag}`);
      } else {
        // TODO(jaked) don't blow up on failed notes
        note.rendered.reconcile(this.trace, this.level);
        const node = note.rendered.get();

        // TODO(jaked) compute at note compile time?
        const html = ReactDOMServer.renderToStaticMarkup(node as React.ReactElement);
        res.setHeader("Content-Type", "text/html; charset=UTF-8")
        res.end(html);
      }
    }
  }
}
