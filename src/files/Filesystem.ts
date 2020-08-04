import fs from 'fs';
import timers from 'timers';
import * as Path from 'path';
import * as Immutable from 'immutable';
import nsfw from 'nsfw';
import Signal from '../util/Signal';
import { bug } from '../util/bug';
import * as data from '../data';

type FileMetadata = {
  writing: boolean; // true if we are in the middle of writing the file
  lastUpdateMs: number; // timestamp of last in-memory update
  lastWriteMs: number; // timestamp of last write to underlying filesystem
};

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
  files: Signal<data.Files>,
  update: (path: string, buffer: Buffer) => void,
  remove: (path: string) => void,
  rename: (oldPath: string, newPath: string) => void,
  exists: (path: string) => boolean,
  start: () => Promise<void>,
  stop: () => Promise<void>,
}

function make(
  filesPath: string,
  onChange: () => void,
  Now: Now = { now: Date.now },
  Timers: Timers = timers,
  Fs: Fs = fs.promises,
  Nsfw: Nsfw = nsfw,
): Filesystem {
  const filesCell = Signal.cellOk(Immutable.Map<string, data.File>(), onChange);
  const filesMetadata = new Map<string, FileMetadata>();
  let timeout: null | NodeJS.Timeout = null;

  const updateFiles = (
    updater: (files: Immutable.Map<string, data.File>) => Immutable.Map<string, data.File>
  ) => {
    const files = updater(filesCell.get());
    filesCell.setOk(files);
  }

  const updateFile = (
    files: Immutable.Map<string, data.File>,
    path: string,
    buffer: Buffer
  ): Immutable.Map<string, data.File> => {
    const now = Date.now();
    const oldFile = files.get(path);
    if (oldFile) {
      if (debug) console.log(`${path} has oldFile`);
      const fileMetadata = filesMetadata.get(path) || bug(`expected metadata for ${path}`);
      // we just wrote the file, this is most likely a notification
      // of that write, so skip it.
      // TODO(jaked) should check this before reading file.
      if (fileMetadata.writing) {
        if (debug) console.log(`${path} is being written`);
        return files;
      }
      if (Date.now() < fileMetadata.lastWriteMs + 5000) {
        if (debug) console.log(`${path} was just written`);
        return files;
      }
      if (buffer.equals(oldFile.bufferCell.get())) {
        if (debug) console.log(`${path} has not changed`);
        return files;
      }

      if (debug) console.log(`updating ${path}`);
      fileMetadata.lastUpdateMs = now;
      fileMetadata.lastWriteMs = now;
      oldFile.bufferCell.setOk(buffer);
      return files;
    } else {
      if (debug) console.log(`adding ${path}`);
      const fileMetadata =
        { lastUpdateMs: now, lastWriteMs: now, writing: false };
      filesMetadata.set(path, fileMetadata);
      const file = new data.File(path, Signal.cellOk(buffer, onChange));
      return files.set(path, file);
    }
  }

  const handleNsfwEvents = async (nsfwEvents: Array<NsfwEvent>) => {
    function readBuffer(directory: string, file: string): Promise<Buffer> {
      return Fs.readFile(Path.resolve(directory, file));
    }

    const events = await Promise.all(
      nsfwEvents.map(async function(ev: NsfwEvent): Promise<[ NsfwEvent, Buffer ]> {
        switch (ev.action) {
          case 0:   // created
          case 2: { // modified
            if (debug) console.log(`${ev.directory} / ${ev.file} was ${ev.action == 0 ? 'created' : 'modified'}`);
            const buffer = await readBuffer(ev.directory, ev.file);
            return [ ev, buffer ];
          }

          case 3: { // renamed
            if (debug) console.log(`${(ev as any).directory} / ${ev.oldFile} was renamed to ${ev.newFile}`);
            const buffer = await readBuffer(ev.newDirectory, ev.newFile);
            return [ ev, buffer ];
          }

          case 1: { // deleted
            if (debug) console.log(`${ev.directory} / ${ev.file} was deleted`);
            return [ ev, emptyBuffer ];
          }
        }
      })
    )

    updateFiles(files => {
      // defer deletions to account for delete/add
      // TODO(jaked) rethink this
      const deleted = new Set<string>();
      files =
        events.reduce((files, [ ev, buffer ]) => {
          switch (ev.action) {
            case 0:   // created
            case 2: { // modified
              const path = canonizePath(filesPath, ev.directory, ev.file);
              deleted.delete(path);
              return updateFile(files, path, buffer);
            }

            case 3: { // renamed
              const oldPath = canonizePath(filesPath, (ev as any).directory, ev.oldFile);
              deleted.add(oldPath);
              const path = canonizePath(filesPath, ev.newDirectory, ev.newFile);
              return updateFile(files, path, buffer);
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

  // TODO(jaked) type NSFW is not exported
  const watcher: Promise<any> = Nsfw(
    filesPath,
    handleNsfwEvents,
    { debounceMS: 500 }
  );

  const update = (path: string, buffer: Buffer) => {
    updateFiles(files => {
      const oldFile = files.get(path);
      const lastUpdateMs = Date.now();
      if (oldFile) {
        const fileMetadata = filesMetadata.get(path) || bug(`expected metadata for ${path}`);
        if (buffer.equals(oldFile.bufferCell.get())) {
          if (debug) console.log(`${path} has not changed`);
          return files;
        } else {
          if (debug) console.log(`updating file path=${path}`);
          fileMetadata.lastUpdateMs = lastUpdateMs;
          oldFile.bufferCell.setOk(buffer);
          return files;
        }
      } else {
        if (debug) console.log(`new file path=${path}`);
        const fileMetadata = { lastUpdateMs, lastWriteMs: 0, writing: false };
        filesMetadata.set(path, fileMetadata);
        const file = new data.File(path, Signal.cellOk(buffer, onChange));
        return files.set(path, file);
      }
    });
  }

  const remove = (path: string) => {
    updateFiles(files => {
      const lastUpdateMs = Date.now();
      const fileMetadata = filesMetadata.get(path) || bug(`delete: expected metadata for ${path}`);
      fileMetadata.lastUpdateMs = lastUpdateMs;
      return files.delete(path);
    });
  }

  const rename = (oldPath: string, newPath: string) => {
    updateFiles(files => {
      if (oldPath === newPath) return files;
      const lastUpdateMs = Date.now();

      const oldFile = files.get(oldPath) ?? bug(`rename: expected file for ${oldPath}`);
      const oldFileMetadata = filesMetadata.get(oldPath) ?? bug(`rename: expected metadata for ${oldPath}`);
      oldFileMetadata.lastUpdateMs = lastUpdateMs;
      files = files.delete(oldPath);

      const newFile = files.get(newPath);
      if (newFile) {
        const newFileMetadata = filesMetadata.get(newPath) ?? bug(`rename: expected metadata for ${newPath}`);
        newFileMetadata.lastUpdateMs = lastUpdateMs;
        newFile.bufferCell.setOk(oldFile.bufferCell.get());
      } else {
        const newFileMetadata = { lastUpdateMs, lastWriteMs: 0, writing: false };
        filesMetadata.set(newPath, newFileMetadata);
        const newFile = new data.File(newPath, Signal.cellOk(oldFile.bufferCell.get(), onChange));
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

  const shouldWrite = (path: string, fileMetadata: FileMetadata, force: boolean) => {
    // we're in the middle of a write
    if (fileMetadata.writing) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): false because file.writing`);
      return false;
    }

    // the current in-memory file is already written
    if (fileMetadata.lastWriteMs >= fileMetadata.lastUpdateMs) {
      // if (debugShouldWrite) console.log(`shouldWrite(${path}): false because already written`);
      return false;
    }

    if (force) {
      if (debugShouldWrite) console.log(`shouldWrite($path): true because force`);
      return true;
    }

    const now = Date.now();

    // there's been no update in 500 ms
    if (now > fileMetadata.lastUpdateMs + 500) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): true because no update in 500 ms`);
      return true;
    }

    // the file hasn't been written in 5 s
    if (now > fileMetadata.lastWriteMs + 5000) {
      if (debugShouldWrite) console.log(`shouldWrite(${path}): true because no write in 5 s`);
      return true;
    }

    if (debugShouldWrite) console.log(`shouldWrite(${path}): false because otherwise`);
    return false;
  }

  const timerCallback = (force = false) => {
    if (debug) console.log(`timerCallback`);
    filesMetadata.forEach((fileMetadata, path) => {
      if (shouldWrite(path, fileMetadata, force)) {
        fileMetadata.writing = true;

        const lastWriteMs = Date.now();
        const file = filesCell.get().get(path);
        const filePath = Path.join(filesPath, path);
        if (file) {
          if (debug) console.log(`writeFile(${path})`);
          Fs.mkdir(Path.dirname(filePath), { recursive: true })
            .then(() => Fs.writeFile(filePath, file.bufferCell.get()))
            .finally(() => {
              fileMetadata.lastWriteMs = lastWriteMs;
              fileMetadata.writing = false;
            });
        } else {
          if (debug) console.log(`unlink(${path})`);
          Fs.unlink(filePath)
            .finally(() => {
              fileMetadata.lastWriteMs = lastWriteMs;
              fileMetadata.writing = false;
            });
        }
      }
    });
  };

  const start = async () => {
    if (debug) console.log(`Filesystem.start`);
    const events: Array<NsfwEvent> = [];
    // TODO(jaked) needs protecting against concurrent updates
    await walkDir(filesPath, events);
    await handleNsfwEvents(events);
    deleteMissing(events);
    timeout = Timers.setInterval(timerCallback, 1000);
    try { (await watcher).start() }
    catch (e) { console.log(e) }
  }

  const stop = async () => {
    if (debug) console.log(`Filesystem.stop`);
    // TODO(jaked) ensure no updates after final write
    timerCallback(true);
    if (timeout) Timers.clearInterval(timeout);
    try { (await watcher).stop() }
    catch (e) { console.log(e) }
  }

  return {
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
