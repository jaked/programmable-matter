import * as Http from 'http';
import * as Path from 'path';
import * as Url from 'url';

import BrowserSync from 'browser-sync';
import ReactDOMServer from 'react-dom/server';

import * as data from './data';
import Signal from './util/Signal';
import Trace from './util/Trace';

export default class Server {
  compiledNotes: Signal<data.CompiledNotes>;
  browserSync: BrowserSync.BrowserSyncInstance;

  constructor(compiledNotes: Signal<data.CompiledNotes>) {
    this.handle = this.handle.bind(this);

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

  update(trace: Trace, level: number) {
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

    // TODO(jaked)
    // what's the update model here?
    // if we just call Signal.get it may not be up to date
    // could track latest top-level version and update just in case
    // how should this interact with atom updates?
    //   - ignore them?
    //   - stream them to client?
    //   - you get what you get when you load the page?
    //   - client has separate atom state?
    const note = this.compiledNotes.get().get(tag);

    if (!note) {
      res.statusCode = 404;
      res.end(`no note ${tag}`);
    } else {
      // TODO(jaked) handle jpegs
      // case 'jpeg':
      //   res.setHeader("Content-Type", "image/jpeg");
      //   res.end(note.buffer);
      //   break;

      // TODO(jaked) don't blow up on failed notes
      const node = note.rendered.get();

      // TODO(jaked) compute at note compile time?
      const html = ReactDOMServer.renderToStaticMarkup(node as React.ReactElement);
      res.setHeader("Content-Type", "text/html; charset=UTF-8")
      res.end(html);
    }
  }
}
