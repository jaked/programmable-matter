import Filesystem from './Filesystem';
import Signal from '../util/Signal';

test('makes dir on update if needed', async () => {
  let ok = false;

  let theNow = 1000
  const Now = {
    now: () => theNow
  }

  let scheduled: Array<() => void> = []
  const Timers = {
    setInterval: (callback: () => void, delay: number) => {
      scheduled.push(callback);
      return callback as unknown as NodeJS.Timeout;
    },
    clearInterval: (timeout: NodeJS.Timeout) => {
      scheduled = scheduled.filter(timeout2 => timeout2 as unknown as NodeJS.Timeout !== timeout)
    },
  }
  const runScheduled = () =>
    scheduled.forEach(timeout => timeout())

  // TODO(jaked)
  // could emulate fs in memory (see https://github.com/webpack/memory-fs)
  // instead of stubbing functions
  const Fs = {
    readdir: (path: string) => Promise.resolve([]),
    stat: (path: string) => Promise.reject('state'),
    readFile: (path: string) => Promise.reject('readFile'),
    writeFile: (path: string, buffer: Buffer) => Promise.resolve(),
    rename: (oldPath: string, newPath: string) => Promise.resolve(),
    unlink: (path: string) => Promise.reject('unlink'),
    mkdir: (path: string, options?: { recursive?: boolean }) => {
      if (path === '/foo' && options && options.recursive)
        ok = true;
      return Promise.resolve();
    }
  };

  const Nsfw = (
    filesPath: string,
    callback: (events: Array<never>) => Promise<void>,
    config: { debounceMS: number },
  ) => Promise.resolve({
    start: () => Promise.resolve(),
    stop: () => Promise.resolve(),
  });

  const filesystem = Filesystem(
    Signal.cellOk(new Map()),
    Now,
    Timers,
    Fs,
    Nsfw,
  );

  await filesystem.setPath('/');
  filesystem.update('/foo/bar.json', Buffer.from('foo bar'));
  theNow = 2000;
  runScheduled();
  await filesystem.stop();

  expect(ok).toBe(true);
});
