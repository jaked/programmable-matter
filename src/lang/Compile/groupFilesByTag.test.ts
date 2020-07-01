import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import * as data from '../../data';
import groupFilesByTag from './groupFilesByTag';

it('deletes group when last file is deleted', () => {
  const files = Signal.cellOk(Immutable.Map({
    'foo.mdx': new data.File('foo.mdx', Signal.cellOk(Buffer.from('')))
  }));
  const grouped = groupFilesByTag(files);
  grouped.reconcile(1);
  expect(grouped.get().size).toBe(1);

  files.update(files => files.delete('foo.mdx'));
  grouped.reconcile(2);
  expect(grouped.get().size).toBe(0);
});
