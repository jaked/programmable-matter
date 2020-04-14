import Trace from '../../util/Trace';
import { bug } from '../../util/bug';
import * as Parse from '../Parse';
import * as data from '../../data';

export default function parseNote(trace: Trace, note: data.Note): data.ParsedNote {
  // TODO(jaked) Object.map or wrap object in helper
  const parsed = Object.keys(note.files).reduce<data.NoteParsed>(
    (obj, key) => {
      switch (key) {
        case 'meta': {
          const file = note.files.meta ?? bug(`expected meta content for ${note.tag}`);
          const meta = file.content.map(Parse.parseExpression);
          return { ...obj, meta };
        }

        case 'mdx': {
          const file = note.files.mdx ?? bug(`expected mdx content for ${note.tag}`);
          const mdx = file.content.map(content => Parse.parse(trace, content));
          return { ...obj, mdx };
        }

        case 'json': {
          const file = note.files.json ?? bug(`expected json content for ${note.tag}`);
          const json = file.content.map(Parse.parseExpression);
          return { ...obj, json };
        }

        case 'table': {
          const file = note.files.table ?? bug(`expected table content for ${note.tag}`);
          const table = file.content.map(Parse.parseExpression);
          return { ...obj, table };
        }

        default: return obj;
      }
    },
    {}
  );
  return { ...note, parsed };
}
