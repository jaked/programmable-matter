import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import { Contents } from '../../data';
import groupFilesByName from './groupFilesByName';

it('deletes group when last file is deleted', () => {
  const files = Signal.cellOk<Contents>(Immutable.Map({
    'foo.pm': {
      type: 'pm',
      path: 'foo.pm',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(''),
    }
  }));
  const grouped = groupFilesByName(files);
  expect(grouped.get().size).toBe(1);

  files.update(files => files.delete('foo.pm'));
  expect(grouped.get().size).toBe(0);
});
