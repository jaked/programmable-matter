import fs from 'fs';
import timers from 'timers';
import * as Path from 'path';
import * as Immutable from 'immutable';
import nsfw from 'nsfw';
import Signal from '../util/Signal';
import { bug } from '../util/bug';

// TODO(jaked) should handle type elsewhere maybe
import { Types } from '../data';

function typeOfPath(path: string): Types {
  const ext = Path.parse(path).ext;
  switch (ext) {
    case '.meta': return 'meta';
    case '.pm': return 'pm';
    case '.mdx': return 'mdx';
    case '.json': return 'json';
    case '.table': return 'table';
    case '.jpeg': return 'jpeg';
    default:
      throw new Error(`unhandled extension '${ext}' for '${path}'`);
  }
}

export type File = {
  path: string;
  buffer: Signal.Writable<Buffer>;
  mtimeMs: Signal<number>;
  type: Types;
}

type FileImpl = {
  path: string;
  buffer: Signal.Writable<Buffer>;
  mtimeMs: Signal.Writable<number>;
  type: Types;
  writing: boolean; // true if we are in the middle of writing the file
  lastUpdateMs: number; // timestamp of last in-memory update
  lastWriteMs: number; // timestamp of last write to underlying filesystem
  deleted: boolean;
}

const debug = false;
const debugShouldWrite = false;

const emptyBuffer = Buffer.from('');

// TODO(jaked)
// the typing included with NSFW doesn't export this
// and also lacks the directory field on rename
// https://github.com/Axosoft/nsfw/pull/115
type NsfwEvent =
  {
    action: 0 | 1 | 2; // created, deleted, modified
    directory: string;
    file: string;
  } |
  {
    action: 3; // renamed
    // directory: string;
    oldFile: string;
    newDirectory: string;
    newFile: string;
  }

function canonizePath(filesPath: string, directory: string, file: string) {
  return Path.resolve('/', Path.relative(filesPath, Path.resolve(directory, file)));
}

type Now = {
  now: () => number,
}

type Timers = {
  // TODO(jaked) can we use an abstract type instead of NodeJS.Timeout?
  setInterval: (callback: () => void, delay: number) => NodeJS.Timeout,
  clearInterval: (timeout: NodeJS.Timeout) => void,
}

type Fs = {
  readdir: (path: string, config: { encoding: 'utf8' }) => Promise<string[]>,
  stat: (path: string) => Promise<{
    isFile: () => boolean,
    isDirectory: () => boolean,
    mtimeMs: number,
  }>,
  readFile: (path: string) => Promise<Buffer>,
  writeFile: (path: string, buffer: Buffer) => Promise<void>,
  unlink: (path: string) => Promise<void>,
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>,
}

type Nsfw = (
  filesPath: string,
  callback: (nsfwEvents: Array<NsfwEvent>) => Promise<void>,
  config: {
    debounceMS: number
  }
) => Promise<{
  start: () => Promise<void>,
  stop: () => Promise<void>,
}>

type Filesystem = {
  setPath: (path: string) => void,
  files: Signal<Immutable.Map<string, File>>,
  update: (path: string, buffer: Buffer) => void,
  remove: (path: string) => void,
  rename: (oldPath: string, newPath: string) => void,
  exists: (path: string) => boolean,
  start: () => Promise<void>,
  stop: () => Promise<void>,
}

function make(
  Now: Now = Date,
  Timers: Timers = timers,
  Fs: Fs = fs.promises,
  Nsfw: Nsfw = nsfw,
): Filesystem {
  let running = false;
  let filesPath: null | string = null;
  const filesCell = Signal.cellOk(Immutable.Map<string, FileImpl>());
  let timeout: null | NodeJS.Timeout = null;
  let watcher: null | {
    start: () => Promise<void>;
    stop: () => Promise<void>;
  } = null;

  const setPath = async (path: string) => {
    if (running) stop();
    filesPath = path;
    watcher = await Nsfw(
      path,
      handleNsfwEvents,
      { debounceMS: 500 }
    );
    start();
  }

  const makeFile = (
    path: string,
    buffer: Buffer,
    mtimeMs: number,
    lastUpdateMs: number,
    lastWriteMs: number
  ) => {
    let file: FileImpl;
    const mtimeMsCell = Signal.cellOk(mtimeMs);
    const bufferCell = Signal.cellOk(buffer, () => {
      const lastUpdateMs = Now.now();
      file.lastUpdateMs = lastUpdateMs;
      mtimeMsCell.setOk(lastUpdateMs);
    });
    const type = typeOfPath(path);
    file = {
      path,
      buffer: bufferCell,
      mtimeMs: mtimeMsCell,
      type,
      lastUpdateMs,
      lastWriteMs,
      writing: false,
      deleted: false,
    };
    return file;
  }

  const updateFiles = (
    updater: (files: Immutable.Map<string, FileImpl>) => Immutable.Map<string, FileImpl>,
    force?: boolean
  ) => {
    const files = updater(filesCell.get());
    filesCell.setOk(files, force);
  }

  const updateFile = (
    files: Immutable.Map<string, FileImpl>,
    path: string,
    buffer: Buffer,
    mtimeMs: number,
  ): Immutable.Map<string, FileImpl> => {
    const file = files.get(path);
    if (file) {
      if (debug) console.log(`${path} has oldFile`);
      // we just wrote the file, this is most likely a notification
      // of that write, so skip it.
      // TODO(jaked) should check this before reading file.
      if (file.writing) {
        if (debug) console.log(`${path} is being written`);
        return files;
      }
      if (Now.now() < file.lastWriteMs + 5000) {
        if (debug) console.log(`${path} was just written`);
        return files;
      }
      if (buffer.equals(file.buffer.get())) {
        if (debug) console.log(`${path} has not changed`);
        return files;
      }

      if (debug) console.log(`updating ${path}`);
      file.lastUpdateMs = mtimeMs;
      file.lastWriteMs = mtimeMs;
      file.buffer.setOk(buffer);
      file.mtimeMs.setOk(mtimeMs);
      return files;
    } else {
      if (debug) console.log(`adding ${path}`);
      const file = makeFile(path, buffer, mtimeMs, mtimeMs, mtimeMs);
      return files.set(path, file);
    }
  }

  const handleNsfwEvents = async (nsfwEvents: Array<NsfwEvent>) => {
    function readBuffer(directory: string, file: string): Promise<{ buffer: Buffer, mtimeMs: number }> {
      const path = Path.resolve(directory, file);
      const buffer = Fs.readFile(path);
      const stat = Fs.stat(path);
      return Promise.all([buffer, stat]).then(([buffer, stat]) => ({ buffer, mtimeMs: stat.mtimeMs }));
    }

    const events = await Promise.all(
      nsfwEvents.map(async function(ev: NsfwEvent): Promise<{ ev: NsfwEvent, buffer: Buffer, mtimeMs: number }> {
        switch (ev.action) {
          case 0:   // created
          case 2: { // modified
            if (debug) console.log(`${ev.directory} / ${ev.file} was ${ev.action == 0 ? 'created' : 'modified'}`);
            const { buffer, mtimeMs } = await readBuffer(ev.directory, ev.file);
            return { ev, buffer, mtimeMs };
          }

          case 3: { // renamed
            if (debug) console.log(`${(ev as any).directory} / ${ev.oldFile} was renamed to ${ev.newFile}`);
            const { buffer, mtimeMs } = await readBuffer(ev.newDirectory, ev.newFile);
            return { ev, buffer, mtimeMs };
          }

          case 1: { // deleted
            if (debug) console.log(`${ev.directory} / ${ev.file} was deleted`);
            return { ev, buffer: emptyBuffer, mtimeMs: 0 };
          }
        }
      })
    )

    updateFiles(files => {
      // defer deletions to account for delete/add
      // TODO(jaked) rethink this
      const deleted = new Set<string>();
      files =
        events.reduce((files, { ev, buffer, mtimeMs }) => {
          if (!filesPath) bug(`expected filesPath`);
          switch (ev.action) {
            case 0:   // created
            case 2: { // modified
              const path = canonizePath(filesPath, ev.directory, ev.file);
              deleted.delete(path);
              return updateFile(files, path, buffer, mtimeMs);
            }

            case 3: { // renamed
              const oldPath = canonizePath(filesPath, (ev as any).directory, ev.oldFile);
              deleted.add(oldPath);
              const path = canonizePath(filesPath, ev.newDirectory, ev.newFile);
              return updateFile(files, path, buffer, mtimeMs);
            }
            case 1:
              const oldPath = canonizePath(filesPath, ev.directory, ev.file);
              deleted.add(oldPath);
              return files;
          }
        }, files);

      deleted.forEach(path => { files = files.delete(path) });
      return files;
    });
  }

  const update = (path: string, buffer: Buffer) => {
    updateFiles(files => {
      const oldFile = files.get(path);
      const lastUpdateMs = Now.now();
      if (oldFile) {
        if (buffer.equals(oldFile.buffer.get())) {
          if (debug) console.log(`${path} has not changed`);
          return files;
        } else {
          if (debug) console.log(`updating file path=${path}`);
          oldFile.buffer.setOk(buffer);
          return files;
        }
      } else {
        if (debug) console.log(`new file path=${path}`);
        const file = makeFile(path, buffer, lastUpdateMs, lastUpdateMs, 0);
        return files.set(path, file);
      }
    });
  }

  const remove = (path: string) => {
    updateFiles(files => {
      const lastUpdateMs = Now.now();
      const file = files.get(path) || bug(`delete: expected file for ${path}`);
      file.lastUpdateMs = lastUpdateMs;
      file.deleted = true;
      return files;
    }, true);
    // TODO(jaked)
    // must force update to trigger sidebar list change
    // since `files` doesn't actually change
    // maybe better to use Immer instead of Immutable + mutation?
  }

  const rename = (oldPath: string, newPath: string) => {
    updateFiles(files => {
      if (oldPath === newPath) return files;
      const lastUpdateMs = Now.now();

      const oldFile = files.get(oldPath) ?? bug(`rename: expected file for ${oldPath}`);
      oldFile.lastUpdateMs = lastUpdateMs;
      oldFile.deleted = true;

      const newFile = files.get(newPath);
      if (newFile) {
        newFile.lastUpdateMs = lastUpdateMs;
        newFile.buffer.setOk(oldFile.buffer.get());
        newFile.mtimeMs.setOk(newFile.mtimeMs.get());
      } else {
        const newFile = makeFile(newPath, oldFile.buffer.get(), oldFile.mtimeMs.get(), lastUpdateMs, 0)
        files = files.set(newPath, newFile);
      }

      return files;
    });
  }

  const exists = (path: string) => {
    return !!filesCell.get().get(path);
  }

  const deleteMissing = (events: NsfwEvent[]) => {
    const seen = new Set<string>();
    events.forEach(ev => {
      if (!filesPath) bug(`expected filesPath`);
      switch (ev.action) {
        case 0:
          seen.add(canonizePath(filesPath, ev.directory, ev.file));
          break;

        default: bug(`expected add`);
      }
    });
    updateFiles(files =>
      files.filter((_, path) => seen.has(path))
    );
  }

  const walkDir = async (directory: string, events: Array<NsfwEvent>) => {
    const dirents = await Fs.readdir(directory, { encoding: 'utf8'});
    return Promise.all(dirents.map(async (file: string) => {
      const dirFile = Path.resolve(directory, file);
      const stats = await Fs.stat(dirFile);
      if (debug) console.log(`${directory} / ${file}`);
      if (stats.isFile()) {
        if (debug) console.log(`${directory} / ${file} isFile`);
        events.push({ action: 0, file, directory });
      } else if (stats.isDirectory()) {
        if (debug) console.log(`${directory} / ${file} isDirectory`);
        return walkDir(dirFile, events);
      } else throw new Error(`unhandled file type for '${dirFile}'`);
    }));
  }

  const shouldWrite = (path: string, file: FileImpl, force: boolean) => {
    // we're in the middle of a write
    if (file.writing) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): false because file.writing`);
      return false;
    }

    // the current in-memory file is already written
    if (file.lastWriteMs >= file.lastUpdateMs) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): false because already written`);
      return false;
    }

    if (force) {
      if (debugShouldWrite) console.log(`shouldWrite($path): true because force`);
      return true;
    }

    const now = Now.now();

    // there's been no update in 500 ms
    if (now > file.lastUpdateMs + 500) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): true because no update in 500 ms`);
      return true;
    }

    // the file hasn't been written in 5 s
    if (now > file.lastWriteMs + 5000) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): true because no write in 5 s`);
      return true;
    }

    if (debugShouldWrite) console.log(`shouldWrite(${path}): false because otherwise`);
    return false;
  }

  const timerCallback = async (force = false) => {
    if (debug) console.log(`timerCallback`);
    const waits: Promise<unknown>[] = []; // TODO(jaked) yuck
    updateFiles(files => {
      files.forEach((file, path) => {
        if (!filesPath) bug(`expected filesPath`);
        if (shouldWrite(path, file, force)) {
          file.writing = true;

          const lastWriteMs = Now.now();
          const filePath = Path.join(filesPath, path);
          if (!file.deleted) {
            if (debug) console.log(`writeFile(${path})`);
            waits.push(Fs.mkdir(Path.dirname(filePath), { recursive: true })
              .then(() => Fs.writeFile(filePath, file.buffer.get()))
              .finally(() => {
                file.lastWriteMs = lastWriteMs;
                file.writing = false;
              }));
          } else {
            if (debug) console.log(`unlink(${path})`);
            waits.push(Fs.unlink(filePath)
              .finally(() => {
                file.lastWriteMs = lastWriteMs;
                file.writing = false;
              }));
            files = files.delete(path);
          }
        }
      });
      return files;
    });
    return Promise.all(waits);
  };

  const start = async () => {
    if (running) return;
    running = true;
    if (!watcher) bug(`expected watcher`);
    if (!filesPath) bug(`expected filesPath`);
    if (timeout) bug(`expected !timeout`);
    if (debug) console.log(`Filesystem.start`);
    const events: Array<NsfwEvent> = [];
    // TODO(jaked) needs protecting against concurrent updates
    await walkDir(filesPath, events);
    await handleNsfwEvents(events);
    deleteMissing(events);
    timeout = Timers.setInterval(timerCallback, 1000);
    try { watcher.start() }
    catch (e) { console.log(e) }
  }

  const stop = async () => {
    if (!running) return;
    running = false;
    if (!watcher) bug(`expected watcher`);
    if (!filesPath) bug(`expected filesPath`);
    if (!timeout) bug(`expected timeout`);
    if (debug) console.log(`Filesystem.stop`);
    Timers.clearInterval(timeout);
    timeout = null;
    // TODO(jaked) ensure no updates after final write
    await timerCallback(true);
    try { watcher.stop() }
    catch (e) { console.log(e) }
  }

  return {
    setPath,
    files: filesCell.map(files => files.filter(file => !file.deleted)),
    update,
    remove,
    rename,
    exists,
    start,
    stop,
  };
}

export default make;
