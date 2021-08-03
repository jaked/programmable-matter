import * as fs from "fs";
import * as Path from 'path';
import * as Fs from 'fs';
import { remote } from 'electron';
import util from 'util';
import GHPages from 'gh-pages';
const writeFile = util.promisify(fs.writeFile);
const mkdir = util.promisify(fs.mkdir);
const rmdir = util.promisify(fs.rmdir);
const ghPagesPublish = util.promisify(GHPages.publish);

import { bug } from '../util/bug';
import * as model from '../model';
import * as MapFuncs from '../util/MapFuncs';

export default async function ghPages(
  compiledNotes: model.CompiledNotes,
) {
  // TODO(jaked) use context provider to avoid manual reconciliation

  // TODO(jaked) generate random dir name?
  const tempdir = Path.resolve(remote.app.getPath("temp"), 'programmable-matter');
  await rmdir(tempdir, { recursive: true });
  await mkdir(tempdir);
  const runtime = Path.resolve(tempdir, '__runtime');
  await mkdir(runtime);
  for (const name of ['Try.js', 'Signal.js', 'Runtime.js']) {
    const srcPath = Path.resolve('.', '__runtime', name);
    const dstPath = Path.resolve(runtime, name);
    const data = Fs.readFileSync(srcPath);
    Fs.writeFileSync(dstPath, data);
  }
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
      await writeFile(path, buffer as Buffer);

    } else if (note.type === 'png') {
      const path = Path.join(tempdir, note.name) + '.png';

      await mkdir(Path.dirname(path), { recursive: true });
      const exportValue = note.exportValue.get();
      const buffer = exportValue.get('buffer') ?? bug(`expected buffer`)
      await writeFile(path, buffer as Buffer);

    } else if (note.type === 'xml') {
      const path = Path.join(tempdir, note.name) + '.xml';

      await mkdir(Path.dirname(path), { recursive: true });
      const xml = note.rendered.get();
      await writeFile(path, xml as string);

    } else if (note.type === 'pm') {
      const htmlPath = Path.join(tempdir, note.name) + '.html';
      const html = note.html ?? bug(`expected html`);
      await mkdir(Path.dirname(htmlPath), { recursive: true });
      await writeFile(htmlPath, html.get())

      const jsPath = Path.join(tempdir, note.name) + '.js';
      const js = note.js ?? bug(`expected js`);
      await writeFile(jsPath, js.get());
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
