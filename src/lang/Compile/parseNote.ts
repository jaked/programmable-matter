import Trace from '../../util/Trace';
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
          const meta = content.map(Parse.parseExpression);
          return { ...obj, meta };
        }

        case 'mdx': {
          const content = note.content.mdx ?? bug(`expected mdx content for ${note.tag}`);
          const mdx = content.map(content => Parse.parse(trace, content));
          return { ...obj, mdx };
        }

        case 'json': {
          const content = note.content.json ?? bug(`expected json content for ${note.tag}`);
          const json = content.map(Parse.parseExpression);
          return { ...obj, json };
        }

        case 'table': {
          const content = note.content.table ?? bug(`expected table content for ${note.tag}`);
          const table = content.map(Parse.parseExpression);
          return { ...obj, table };
        }

        default: return obj;
      }
    },
    {}
  );
  return { ...note, parsed };
}
