import * as Http from 'http';
import * as Path from 'path';
import * as Url from 'url';
import * as Fs from 'fs';

import { bug } from './util/bug';
import * as model from './model';
import * as Name from './util/Name';
import Signal from './util/Signal';

export default class Server {
  compiledNotes: Signal<model.CompiledNotes>;
  http: Http.Server;

  constructor(
    compiledNotes: Signal<model.CompiledNotes>
  ) {
    this.handle = this.handle.bind(this);

    this.compiledNotes = compiledNotes;
    this.http = Http.createServer(this.handle);
    this.http.listen(3001);
  }

  handle(req: Http.IncomingMessage, res: Http.ServerResponse) {
    let url = Url.parse(req.url || '');
    let path = url.path || '';
    const decodedPath = decodeURIComponent(path);
    const ext = Path.parse(decodedPath).ext;
    const name = Name.nameOfPath(decodedPath);

    // TODO(jaked) better way to handle namespace collision
    if (decodedPath.startsWith('/__runtime')) {
      res.setHeader("Content-Type", "text/javascript; charset=UTF-8");
      // TODO(jaked) serve from installation directory
      const data = Fs.readFileSync(`.${decodedPath}`);
      res.end(data);
      return;
    }

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
        res.end(buffer);

      } else if (ext === '.png') {
          const buffer = note.exportValue.get().get('buffer') ?? bug(`expected buffer`);
          res.setHeader("Content-Type", "image/png");
          res.end(buffer);

      } else if (ext === '.xml') {
        // TODO(jaked) don't blow up on failed notes
        const xml = note.rendered.get();

        res.setHeader("Content-Type", "application/rss+xml");
        res.end(xml)

      } else if (ext === '.html' || ext === '') {
        res.setHeader("Content-Type", "text/html; charset=UTF-8")
        res.end(note.html?.get());

      } else if (ext === '.js') {
        res.setHeader("Content-Type", "text/javascript; charset=UTF-8");
        res.end(note.js?.get());

      } else {
        res.statusCode = 404;
        res.end();
      }
    }
  }
}
