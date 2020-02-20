import Trace from '../../util/Trace';
import Try from '../../util/Try';
import { bug } from '../../util/bug';
import * as Parse from '../Parse';
import * as data from '../../data';

export default function parseNote(trace: Trace, note: data.Note): data.ParsedNote {
  // TODO(jaked) Object.map or wrap object in helper
  const parsed = Object.keys(note.content).reduce<data.NoteParsed>(
    (obj, key) => {
      switch (key) {
        case 'meta': {
          const content = note.content.meta ?? bug(`expected meta content for ${note.tag}`);
          const ast = Try.apply(() => Parse.parseExpression(content));
          return { ...obj, meta: ast };
        }

        case 'mdx': {
          const content = note.content.mdx ?? bug(`expected mdx content for ${note.tag}`);
          const ast = Try.apply(() => Parse.parse(trace, content));
          return { ...obj, mdx: ast };
        }

        case 'json': {
          const content = note.content.json ?? bug(`expected json content for ${note.tag}`);
          const ast = Try.apply(() => Parse.parseExpression(content));
          return { ...obj, json: ast };
        }

        case 'table': {
          const content = note.content.table ?? bug(`expected table content for ${note.tag}`);
          return { ...obj, table: Try.ok({}) };
        }

        default: return obj;
      }
    },
    {}
  );
  return { ...note, parsed };
}
