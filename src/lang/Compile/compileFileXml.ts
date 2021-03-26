import { Feed } from 'feed';

import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import { WritableContent, CompiledFile, CompiledNotes } from '../../model';
import Type from '../Type';

const postRe = /^\/blog\/(\d\d\d\d-\d\d-\d\d)/;

export default function compileFileXml(
  file: WritableContent,
  compiledFiles: Signal<Map<string, CompiledFile>> = Signal.ok(new Map()),
  compiledNotes: Signal<CompiledNotes> = Signal.ok(new Map()),
): CompiledFile {
  if (file.path !== '/blog/rss.xml')
    bug(`not implemented`);

  const posts = Signal.filterMap(compiledNotes, (v, k) => postRe.test(k));
  const postMetas = Signal.mapMap(posts, compiledNote => compiledNote.meta);
  const rendered = Signal.joinMap(postMetas).map(postMetas => {
    const feed = new Feed({
      title: 'Technical Difficulties',
      description: 'Mostly programming',
      link: 'https://jaked.org/blog/',
      id: 'https://jaked.org/blog/',
      copyright: '© 2021 Jake Donham',
      generator: 'Programmable Matter',
      author: {
        name: 'Jake Donham',
        email: 'jake.donham@gmail',
        link: 'https://jaked.org/',
      }
    });

    [...postMetas.entries()]
      .sort(([aName], [bName]) => bName.localeCompare(aName))
      .forEach(([name, meta]) => {
        if (meta.publish) {
          feed.addItem({
            title: meta.title ?? 'Blog Post',
            link: `https://jaked.org${name}`,
            date: new Date((postRe.exec(name) || bug(`expected date`))[1]),
          });
        }
      });

    return feed.rss2();
  });

  return {
    ast: Signal.ok(undefined),
    typesMap: Signal.ok(new Map()),
    problems: Signal.ok(false),
    exportType: Signal.ok(Type.module({})),
    exportValue: Signal.ok(new Map()),
    exportDynamic: Signal.ok(new Map()),
    rendered
  }
}