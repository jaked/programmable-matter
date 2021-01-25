import fs from 'fs';
import timers from 'timers';
import * as Path from 'path';
import * as Immer from 'immer';
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

type FileMeta = {
  writing: boolean; // true if we are in the middle of writing the file
  lastUpdateMs: number; // timestamp of last in-memory update
  lastWriteMs: number; // timestamp of last write to underlying filesystem
  deleted: boolean; // true if file has been deleted in memory
  mtimeMsCell: Signal.Writable<number>;
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
  setPath: (path: string) => Promise<void>,
  files: Signal<Map<string, File>>,
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
  const filesCell = Signal.cellOk(new Map<string, File>());
  const fileMetas = new Map<string, FileMeta>();
  let timeout: null | NodeJS.Timeout = null;
  let watcher: null | {
    start: () => Promise<void>;
    stop: () => Promise<void>;
  } = null;

  const setPath = async (path: string) => {
    if (running) await stop();
    filesPath = path;
    watcher = await Nsfw(
      path,
      handleNsfwEvents,
      { debounceMS: 500 }
    );
    return start();
  }

  const makeFile = (
    path: string,
    buffer: Buffer,
    mtimeMs: number,
    lastUpdateMs: number,
    lastWriteMs: number
  ) => {
    const fileMeta = {
      lastUpdateMs,
      lastWriteMs,
      writing: false,
      deleted: false,
      mtimeMsCell: Signal.cellOk(mtimeMs),
    }
    const bufferCell = Signal.cellOk(buffer).mapWritable(b => b, b => {
      const lastUpdateMs = Now.now();
      fileMeta.lastUpdateMs = lastUpdateMs;
      fileMeta.mtimeMsCell.setOk(lastUpdateMs);
      return b;
    });
    const type = typeOfPath(path);
    const file = {
      path,
      buffer: bufferCell,
      mtimeMs: fileMeta.mtimeMsCell,
      type,
    };
    fileMetas.set(path, fileMeta);
    return file;
  }

  const updateFiles = (
    updater: (files: Map<string, File>) => void
  ) => {
    const files = Immer.produce(filesCell.get(), updater);
    filesCell.setOk(files);
  }

  // updates coming from Nsfw
  const updateFile = (
    files: Map<string, File>,
    path: string,
    buffer: Buffer,
    mtimeMs: number,
  ): void => {
    const file = files.get(path);
    if (file) {
      const fileMeta = fileMetas.get(path) ?? bug(`expected fileMeta`);
      if (debug) console.log(`${path} has oldFile`);
      // TODO(jaked) should check this before reading file.
      if (fileMeta.writing) {
        if (debug) console.log(`${path} is being written`);
        return;
      }
      // we just wrote the file, this is most likely a notification
      // of that write, so skip it.
      if (Now.now() < fileMeta.lastWriteMs + 5000) {
        if (debug) console.log(`${path} was just written`);
        return;
      }
      if (buffer.equals(file.buffer.get())) {
        if (debug) console.log(`${path} has not changed`);
        return;
      }

      if (debug) console.log(`updating ${path}`);
      file.buffer.setOk(buffer);
      fileMeta.mtimeMsCell.setOk(mtimeMs);
      fileMeta.lastUpdateMs = mtimeMs;
      fileMeta.lastWriteMs = mtimeMs;
    } else {
      if (debug) console.log(`adding ${path}`);
      try {
        const file = makeFile(path, buffer, mtimeMs, mtimeMs, mtimeMs);
        files.set(path, file);
      } catch (e) {
        console.log(e);
      }
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
      events.forEach(({ ev, buffer, mtimeMs }) => {
        if (!filesPath) bug(`expected filesPath`);
        switch (ev.action) {
          case 0:   // created
          case 2: { // modified
            const path = canonizePath(filesPath, ev.directory, ev.file);
            deleted.delete(path);
            updateFile(files, path, buffer, mtimeMs);
            break;
          }

          case 3: { // renamed
            const oldPath = canonizePath(filesPath, (ev as any).directory, ev.oldFile);
            deleted.add(oldPath);
            const path = canonizePath(filesPath, ev.newDirectory, ev.newFile);
            updateFile(files, path, buffer, mtimeMs);
            break;
          }
          case 1: // deleted
            const oldPath = canonizePath(filesPath, ev.directory, ev.file);
            deleted.add(oldPath);
            break;
        }
      }, files);

      deleted.forEach(path => { files.delete(path) });
    });
  }

  const update = (path: string, buffer: Buffer) => {
    updateFiles(files => {
      const oldFile = files.get(path);
      const lastUpdateMs = Now.now();
      if (oldFile) {
        if (buffer.equals(oldFile.buffer.get())) {
          if (debug) console.log(`${path} has not changed`);
        } else {
          if (debug) console.log(`updating file path=${path}`);
          oldFile.buffer.setOk(buffer);
        }
      } else {
        if (debug) console.log(`new file path=${path}`);
        const file = makeFile(path, buffer, lastUpdateMs, lastUpdateMs, 0);
        files.set(path, file);
      }
    });
  }

  const remove = (path: string) => {
    updateFiles(files => {
      const lastUpdateMs = Now.now();
      const fileMeta = fileMetas.get(path) ?? bug(`expected fileMeta`);
      fileMeta.lastUpdateMs = lastUpdateMs;
      fileMeta.deleted = true;
      files.delete(path);
    });
  }

  const rename = (oldPath: string, newPath: string) => {
    updateFiles(files => {
      if (oldPath === newPath) return;
      const lastUpdateMs = Now.now();

      const oldFile = files.get(oldPath) ?? bug(`expected oldFile`);
      const oldFileMeta = fileMetas.get(oldPath) ?? bug(`rename: expected file for ${oldPath}`);
      oldFileMeta.lastUpdateMs = lastUpdateMs;
      oldFileMeta.deleted = true;
      files.delete(oldPath);

      const newFile = files.get(newPath);
      if (newFile) {
        const newFileMeta = fileMetas.get(newPath) ?? bug(`expected newFileMeta`);
        newFile.buffer.setOk(oldFile.buffer.get());
        newFileMeta.lastUpdateMs = lastUpdateMs;
        newFileMeta.mtimeMsCell.setOk(oldFile.mtimeMs.get());
      } else {
        const newFile = makeFile(newPath, oldFile.buffer.get(), oldFile.mtimeMs.get(), lastUpdateMs, 0)
        files.set(newPath, newFile);
      }
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
    updateFiles(files => {
      files.forEach((_, path) => {
        if (!seen.has(path)) {
          fileMetas.delete(path);
          files.delete(path);
        }
      });
    });
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

  const shouldWrite = (path: string, fileMeta: FileMeta, force: boolean) => {
    // we're in the middle of a write
    if (fileMeta.writing) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): false because file.writing`);
      return false;
    }

    // the current in-memory file is already written
    if (fileMeta.lastWriteMs >= fileMeta.lastUpdateMs) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): false because already written`);
      return false;
    }

    if (force) {
      if (debugShouldWrite) console.log(`shouldWrite($path): true because force`);
      return true;
    }

    const now = Now.now();

    // there's been no update in 500 ms
    if (now > fileMeta.lastUpdateMs + 500) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): true because no update in 500 ms`);
      return true;
    }

    // the file hasn't been written in 5 s
    if (now > fileMeta.lastWriteMs + 5000) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): true because no write in 5 s`);
      return true;
    }

    if (debugShouldWrite) console.log(`shouldWrite(${path}): false because otherwise`);
    return false;
  }

  const timerCallback = async (force = false) => {
    if (debug) console.log(`timerCallback`);
    const waits: Promise<unknown>[] = []; // TODO(jaked) yuck
    fileMetas.forEach((fileMeta, path) => {
      if (!filesPath) bug(`expected filesPath`);
      if (shouldWrite(path, fileMeta, force)) {
        fileMeta.writing = true;

        const lastWriteMs = Now.now();
        const filePath = Path.join(filesPath, path);
        if (!fileMeta.deleted) {
          if (debug) console.log(`writeFile(${path})`);
          const file = filesCell.get().get(path) ?? bug(`expected file`);
          waits.push(Fs.mkdir(Path.dirname(filePath), { recursive: true })
            .then(() => Fs.writeFile(filePath, file.buffer.get()))
            .finally(() => {
              fileMeta.lastWriteMs = lastWriteMs;
              fileMeta.writing = false;
            }));
        } else {
          if (debug) console.log(`unlink(${path})`);
          waits.push(Fs.unlink(filePath)
            .finally(() => {
              fileMetas.delete(path);
            }));
        }
      }
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
    files: filesCell,
    update,
    remove,
    rename,
    exists,
    start,
    stop,
  };
}

export default make;
