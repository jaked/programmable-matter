import fs from 'fs';
import timers from 'timers';
import * as Path from 'path';
import * as Immer from 'immer';
import nsfw from 'nsfw';
import Signal from '../util/Signal';
import { bug } from '../util/bug';
import * as model from '../model';

type FsFile = {
  mtimeMs: number;
  buffer: Buffer;
  deleted: boolean;
  writing: boolean; // true if we are in the middle of writing the file
}

const debug = false;

const emptyBuffer = Buffer.from('');

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
  rename: (oldPath: string, newPath: string) => Promise<void>,
  unlink: (path: string) => Promise<void>,
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>,
}

type Nsfw = (
  filesPath: string,
  callback: (nsfwEvents: Array<nsfw.FileChangeEvent>) => Promise<void>,
  config: {
    debounceMS: number
  }
) => Promise<{
  start: () => Promise<void>,
  stop: () => Promise<void>,
}>

type Filesystem = {
  update: (path: string, buffer: Buffer) => void,
  remove: (path: string) => void,
  rename: (oldPath: string, newPath: string) => void,
  exists: (path: string) => boolean,
  fsPaths: () => string[],
  close: () => Promise<void>,
}

function excluded(file: string) {
  return (
    file.endsWith('.tmp') ||
    file.split(Path.sep).some(comp => comp.startsWith('.'))
  );
}

function makeHandleNsfwEvents(
  Now: Now,
  Fs: Fs,
  rootPath: string,
  fsFiles: Map<string, FsFile>,
)  {
  return async (nsfwEvents: Array<nsfw.FileChangeEvent>) => {
    nsfwEvents = nsfwEvents.filter(ev => {
      switch (ev.action) {
        case 0: // created
        case 2: // modified
          return !excluded(Path.join(ev.directory, ev.file));
        case 3: // renamed
          return !excluded(Path.join(ev.directory, ev.oldFile));
        case 1: // deleted
          return !excluded(ev.file);
      }
    });

    // read file mtimes / buffers
    const buffers: Promise<[string, { mtimeMs: number, buffer: Buffer }]>[] = [];
    for (const ev of nsfwEvents) {
      switch (ev.action) {
        case 0:   // created
        case 2: { // modified
          const fsPath = Path.resolve(ev.directory, ev.file);
          // TODO(jaked) avoid re-reading file if mtime hasn't changed
          const buffer = Fs.readFile(fsPath);
          const stat = Fs.stat(fsPath);
          const path = canonizePath(rootPath, ev.directory, ev.file);
          buffers.push(Promise.all([buffer, stat]).then(([buffer, stat]) =>
            [path, { buffer, mtimeMs: stat.mtimeMs }]
          ));
          continue;
        }
      }
    };
    const buffersByPath = new Map(await Promise.all(buffers.values()));

    for (const ev of nsfwEvents) {
      switch (ev.action) {
        case 0:   // created
        case 2: { // modified
          if (debug) console.log(`${ev.directory} / ${ev.file} was ${ev.action == 0 ? 'created' : 'modified'}`);
          const path = canonizePath(rootPath, ev.directory, ev.file);
          const { buffer, mtimeMs } = buffersByPath.get(path) ?? bug(`expected buffer`);
          const fsFile = fsFiles.get(path);
          if (fsFile) {
            if (fsFile.writing) continue;
            if (fsFile.mtimeMs === mtimeMs) continue;
            fsFile.mtimeMs = mtimeMs;
            if (fsFile.buffer.equals(buffer)) continue;
            fsFile.buffer = buffer;
          } else {
            fsFiles.set(path, {
              mtimeMs,
              buffer,
              deleted: false,
              writing: false
            });
          }
          continue;
        }

        case 3: { // renamed
          if (debug) console.log(`${(ev as any).directory} / ${ev.oldFile} was renamed to ${ev.newFile}`);
          const oldPath = canonizePath(rootPath, (ev as any).directory, ev.oldFile);
          const newPath = canonizePath(rootPath, ev.newDirectory, ev.newFile);
          const fsFile = fsFiles.get(oldPath) ?? bug(`expected fsFile`);
          fsFiles.set(oldPath, {
            mtimeMs: Now.now(),
            buffer: emptyBuffer,
            deleted: true,
            writing: false
          });
          fsFiles.set(newPath, {
            mtimeMs: Now.now(),
            buffer: fsFile.buffer,
            deleted: false,
            writing: false
          });
          continue;
        }

        case 1: { // deleted
          if (debug) console.log(`${ev.directory} / ${ev.file} was deleted`);
          const path = canonizePath(rootPath, ev.directory, ev.file);
          fsFiles.set(path, {
            mtimeMs: Now.now(),
            buffer: emptyBuffer,
            deleted: true,
            writing: false
          });
          continue;
        }
      }
    }
  }
}

function make(
  rootPath: string,
  files: Signal.Writable<model.Files>,
  Now: Now = Date,
  Timers: Timers = timers,
  Fs: Fs = fs.promises as Fs, // TODO(jaked)
  Nsfw: Nsfw = nsfw,
): Filesystem {
  const fsFiles = new Map<string, FsFile>();
  let timeout: null | NodeJS.Timeout;
  let inTimerCallback = false;

  const handleNsfwEvents = makeHandleNsfwEvents(Now, Fs, rootPath, fsFiles);

  const watcher = Nsfw(
    rootPath,
    handleNsfwEvents,
    { debounceMS: 500 }
  );

  watcher.then(async (watcher) => {
    const events: Array<nsfw.FileChangeEvent> = [];
    // TODO(jaked) needs protecting against concurrent updates
    await walkDir(rootPath, events);
    await handleNsfwEvents(events);
    await watcher.start();
    timeout = Timers.setInterval(timerCallback, 1000);
  })

  const update = (path: string, buffer: Buffer) => {
    files.produce(files => {
      const oldFile = files.get(path);
      const mtimeMs = Now.now();
      if (oldFile) {
        if (buffer.equals(oldFile.buffer)) {
          if (debug) console.log(`${path} has not changed`);
        } else {
          if (debug) console.log(`updating file path=${path}`);
          files.set(path, {
            mtimeMs,
            buffer,
            deleted: false,
          })
          oldFile.buffer = buffer;
          oldFile.mtimeMs = mtimeMs;
        }
      } else {
        if (debug) console.log(`new file path=${path}`);
        files.set(path, {
          mtimeMs,
          buffer,
          deleted: false,
        });
      }
    });
  }

  const remove = (path: string) => {
    files.produce(files => {
      files.set(path, {
        mtimeMs: Now.now(),
        buffer: emptyBuffer,
        deleted: true
      });
    });
  }

  const rename = (oldPath: string, newPath: string) => {
    files.produce(files => {
      if (oldPath === newPath) return;
      const mtimeMs = Now.now();

      const oldFile = files.get(oldPath) ?? bug(`expected oldFile`);
      const buffer = oldFile.buffer;
      files.set(oldPath, {
        mtimeMs,
        buffer: emptyBuffer,
        deleted: true
      });
      files.set(newPath, {
        mtimeMs,
        buffer,
        deleted: false,
      });
    });
  }

  const exists = (path: string) => {
    return files.get().has(path);
  }

  const walkDir = async (directory: string, events: Array<nsfw.FileChangeEvent>) => {
    const dirents = await Fs.readdir(directory, { encoding: 'utf8'});
    return Promise.all(dirents.map(async (file: string) => {
      if (excluded(file)) return;
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

  const timerCallback = async (force = false) => {
    if (inTimerCallback) return;
    inTimerCallback = true;
    if (debug) console.log(`timerCallback`);
    const now = Now.now();
    const ops: Promise<unknown>[] = [];

    files.produce(files => {
      const paths = new Set([...files.keys(), ...fsFiles.keys()]).keys();
      for (const path of paths) {
        const filePath = Path.join(rootPath, path);
        const file = files.get(path) ?? {
          mtimeMs: 0,
          buffer: emptyBuffer,
          deleted: true,
        };
        if (!files.has(path)) files.set(path, file);
        const fsFile = fsFiles.get(path) ?? {
          mtimeMs: 0,
          buffer: emptyBuffer,
          deleted: true,
          writing: false
        };
        if (!fsFiles.has(path)) fsFiles.set(path, fsFile);

        if (file.deleted && fsFile.deleted) {
          if (debug) console.log(`both deleted for ${path}`);
          files.delete(path);
          fsFiles.delete(path);

        } else if (file.mtimeMs > fsFile.mtimeMs) {
          if (debug) console.log(`file newer (${file.mtimeMs} > ${fsFile.mtimeMs}) for ${path}`);
          if (file.deleted) {
            if (debug) console.log(`file deleted for ${path}`);
            if (fsFile.writing) continue;
            if (debug) console.log(`deleting ${filePath}`);
            fsFile.deleted = true;
            fsFile.buffer = emptyBuffer;
            fsFile.writing = true;
            ops.push(
              Fs.unlink(filePath)
              .catch(e => { console.log(e) })
              .finally(() => fsFile.writing = false)
            );

          } else if (file.mtimeMs > fsFile.mtimeMs && fsFile.buffer.equals(file.buffer)) {
            fsFile.deleted = false;
            fsFile.mtimeMs = file.mtimeMs;

          } else if (
            force ||
            file.mtimeMs < now - 500 ||
            fsFile.mtimeMs < now - 5000
          ) {
            if (debug) console.log(`should write for ${path}`);
            if (fsFile.writing) continue;
            if (debug) console.log(`writing ${filePath}`);
            fsFile.deleted = false;
            fsFile.writing = true;
            const tmpFilePath = filePath + '.tmp';
            const buffer = Immer.original(file)?.buffer ?? bug(`expected buffer`);
            ops.push((async () => {
              try {
                await Fs.mkdir(Path.dirname(filePath), { recursive: true });
                if (debug) console.log(`writeFile(${tmpFilePath})`);
                await Fs.writeFile(tmpFilePath, buffer);
                if (debug) console.log(`rename(${tmpFilePath}, ${filePath}`)
                await Fs.rename(tmpFilePath, filePath);
                if (debug) console.log(`stat(${filePath})`);
                const stat = await Fs.stat(filePath);
                if (debug) console.log(`mtimeMs = ${stat.mtimeMs} for ${filePath}`)
                fsFile.mtimeMs = stat.mtimeMs;
              } catch(e) { console.log(e) }
              finally {
                fsFile.buffer = buffer;
                fsFile.writing = false
              }
            })());
          }

        } else if (fsFile.mtimeMs > file.mtimeMs) {
          if (file.buffer.equals(fsFile.buffer) && file.deleted === fsFile.deleted)
            continue;
          if (debug) console.log(`fsFile newer (${fsFile.mtimeMs} > ${file.mtimeMs}) for ${path}`);
          file.mtimeMs = fsFile.mtimeMs;
          file.buffer = fsFile.buffer;
          file.deleted = fsFile.deleted;
        }
      }
    });
    return Promise.all(ops).finally(() => inTimerCallback = false);
  };

  const fsPaths = () => [...fsFiles.keys()]

  const close = async () => {
    if (timeout) Timers.clearInterval(timeout);
    // TODO(jaked) ensure no updates after final write
    await timerCallback(true);
    await watcher.then(watcher => watcher.stop());
  }

  return {
    update,
    remove,
    rename,
    exists,
    fsPaths,
    close
  };
}

export default make;
