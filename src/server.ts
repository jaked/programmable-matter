import Express from 'express';
import ReactDOMServer from 'react-dom/server';

import * as data from './data';
import Signal from './util/Signal';

export default class Server {
  notes: Signal<data.Notes>;
  app: Express.Express;

  constructor(notes: Signal<data.Notes>) {
    this.notes = notes;
    this.app = Express();
    this.app.get('*', function (req, res) {
      const tag = decodeURIComponent(req.path.slice(1, req.path.length));

      // TODO(jaked)
      // what's the update model here?
      // if we just call Signal.get it may not be up to date
      // could track latest top-level version and update just in case
      // how should this interact with atom updates?
      //   - ignore them?
      //   - stream them to client?
      //   - you get what you get when you load the page?
      //   - client has separate atom state?
      const note = notes.get().get(tag);

      if (!note) {
        res.status(404).send(`no note ${tag}`);
      } else {
        if (!note.compiled) { throw new Error('expected compiled note'); }
        const node = note.compiled.get().rendered(); // TODO(jaked) fix Try.get()

        // TODO(jaked) compute at note compile time?
        const html = ReactDOMServer.renderToStaticMarkup(node as React.ReactElement);
        res.send(html);
      }
    });
    this.app.listen(3000);
  }
}
