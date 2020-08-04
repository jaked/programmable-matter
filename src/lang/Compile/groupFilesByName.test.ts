import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import File from '../../files/File';
import groupFilesByName from './groupFilesByName';

it('deletes group when last file is deleted', () => {
  const files = Signal.cellOk(Immutable.Map({
    'foo.mdx': new File('foo.mdx', Buffer.from(''))
  }));
  const grouped = groupFilesByName(files);
  grouped.reconcile(1);
  expect(grouped.get().size).toBe(1);

  files.update(files => files.delete('foo.mdx'));
  grouped.reconcile(2);
  expect(grouped.get().size).toBe(0);
});
