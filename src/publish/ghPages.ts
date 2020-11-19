import * as fs from "fs";
import * as Path from 'path';
import { remote } from 'electron';
import util from 'util';
import GHPages from 'gh-pages';
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const rmdir = util.promisify(fs.rmdir;
const ghPagesPublish = util.promisify(GHPages.publish);

import * as React from 'react';
import ReactDOMServer from 'react-dom/server';

import * as Render from '../lang/Render';
import * as data from '../data';

export default async function ghPages(
  compiledNotes: data.CompiledNotes,
) {
  // TODO(jaked) use context provider to avoid manual reconciliation

  // TODO(jaked) generate random dir name?
  const tempdir = Path.resolve(remote.app.getPath("temp"), 'programmable-matter');
  rmdir(tempdir, { recursive: true } as any);
  await mkdir(tempdir);
  await writeFile(Path.resolve(tempdir, '.nojekyll'), '');
  await writeFile(Path.resolve(tempdir, 'CNAME'), "jaked.org");
  await Promise.all(compiledNotes.map(async note => {
    // TODO(jaked) don't blow up on failed notes

    note.meta.reconcile();
    if (!note.meta.get().publish) return
    note.publishedType.reconcile();
    const publishedType = note.publishedType.get();

    if (publishedType === 'jpeg') {
      const path = Path.resolve(tempdir, note.name) + '.jpeg';

      await mkdir(Path.dirname(path), { recursive: true });
      note.exportValue.reconcile();
      const exportValue = note.exportValue.get();
      exportValue.buffer.reconcile();
      const buffer = exportValue.buffer.get();
      await writeFile(path, buffer);

    } else if (publishedType === 'html') {
      const path = Path.resolve(tempdir, note.name) + '.html';

      note.rendered.reconcile();
      const rendered = note.rendered.get();
      if (!rendered) return;

      const renderedWithContext =
        React.createElement(Render.context.Provider, { value: 'server' }, rendered)
      const html = ReactDOMServer.renderToStaticMarkup(renderedWithContext);
      await mkdir(Path.dirname(path), { recursive: true });
      await writeFile(path, html);
    }
  }).values());
  await ghPagesPublish(tempdir, {
    src: '**',
    dotfiles: true,
    branch: 'master',
    repo: 'https://github.com/jaked/jaked.github.io.git',
    message: 'published from Programmable Matter',
    name: 'Jake Donham',
    email: 'jake.donham@gmail.com',
  });
}
