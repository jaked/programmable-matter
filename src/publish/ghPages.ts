import * as fs from "fs";
import * as Path from 'path';
import { remote } from 'electron';
import util from 'util';
import GHPages from 'gh-pages';
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const rmdir = util.promisify(fs.rmdir);
const ghPagesPublish = util.promisify(GHPages.publish);

import * as React from 'react';
import ReactDOMServer from 'react-dom/server';

import { bug } from '../util/bug';
import * as Render from '../lang/Render';
import * as model from '../model';
import * as MapFuncs from '../util/MapFuncs';

export default async function ghPages(
  compiledNotes: model.CompiledNotes,
) {
  // TODO(jaked) use context provider to avoid manual reconciliation

  // TODO(jaked) generate random dir name?
  const tempdir = Path.resolve(remote.app.getPath("temp"), 'programmable-matter');
  await rmdir(tempdir, { recursive: true } as any);
  await mkdir(tempdir);
  await writeFile(Path.resolve(tempdir, '.nojekyll'), '');
  await writeFile(Path.resolve(tempdir, 'CNAME'), "jaked.org");
  await Promise.all([...MapFuncs.map(compiledNotes, async note => {
    // TODO(jaked) don't blow up on failed notes

    if (!note.meta.get().publish) return

    if (note.type === 'jpeg') {
      const path = Path.join(tempdir, note.name) + '.jpeg';

      await mkdir(Path.dirname(path), { recursive: true });
      const exportValue = note.exportValue.get();
      const buffer = exportValue.get('buffer') ?? bug(`expected buffer`)
      await writeFile(path, buffer.get());

    } else if (note.type === 'xml') {
      const path = Path.join(tempdir, note.name) + '.xml';

      await mkdir(Path.dirname(path), { recursive: true });
      const xml = note.rendered.get();
      await writeFile(path, xml);

    } else if (note.type === 'pm') {
      const path = Path.join(tempdir, note.name) + '.html';

      const rendered = note.rendered.get();
      if (!rendered) return;

      const renderedWithContext =
        React.createElement(Render.context.Provider, { value: 'server' }, rendered)
      const html = ReactDOMServer.renderToStaticMarkup(renderedWithContext);
      await mkdir(Path.dirname(path), { recursive: true });
      await writeFile(path, html);
    }
  }).values()]);
  const publish = true;
  if (publish) {
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
}
