import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import { Contents } from '../../data';
import groupFilesByName from './groupFilesByName';

it('deletes group when last file is deleted', () => {
  const files = Signal.cellOk<Contents>(Immutable.Map({
    'foo.mdx': {
      type: 'mdx',
      path: 'foo.mdx',
      mtimeMs: Signal.ok(0),
      content: Signal.ok(''),
    }
  }));
  const grouped = groupFilesByName(files);
  grouped.reconcile();
  expect(grouped.get().size).toBe(1);

  files.update(files => files.delete('foo.mdx'));
  grouped.reconcile();
  expect(grouped.get().size).toBe(0);
});
