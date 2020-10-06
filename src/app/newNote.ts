import * as Immutable from 'immutable';
import * as Name from '../util/Name';
import Signal from '../util/Signal';

export default (args: {
  fsUpdate: (fn: string, buffer: Buffer) => void,
  notes: Signal<Immutable.Map<string, unknown>>,
  focusDir: Signal<string | null>,
  callback: (name: string) => void,
}): Signal<(name: string) => string> =>
  Signal.join(args.notes, args.focusDir).map(([notes, focusDir]) =>
    (name: string) => {
      name = name.trim();
      if (name === '') name = 'untitled';
      if (focusDir) {
        name = Name.join(focusDir, name);
      }
      name = Name.normalize(name);
      if (notes.has(name)) {
        for (let i = 1; ; i++) {
          const newName = `${name} (${i})`;
          if (!notes.has(newName)) {
            name = newName;
            break;
          }
        }
      }
      args.fsUpdate(`${name}.mdx`, Buffer.from('', 'utf8'));
      args.callback(name);
      return name;
    }
  )