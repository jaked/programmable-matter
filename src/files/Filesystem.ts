import { promises as Fs } from 'fs';
import * as Path from 'path';
import * as Timers from 'timers';
import * as Immutable from 'immutable';
import Nsfw from 'nsfw';
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

export class Filesystem {
  private filesPath: string;
  private onChange: () => void;
  private filesCell: Signal.Cell<Immutable.Map<string, data.File>>;
  private filesMetadata: Map<string, FileMetadata> = new Map();
  private timeout: null | NodeJS.Timeout = null;

  // TODO(jaked) type NSFW is not exported
  private watcher: null | any = null;

  public constructor(filesPath: string, onChange: () => void) {
    this.filesPath = filesPath;
    this.onChange = onChange;
    this.filesCell = Signal.cellOk(Immutable.Map(), onChange);
    const watcher = Nsfw(
      this.filesPath,
      this.handleNsfwEvents,
      { debounceMS: 500 }
    );
    watcher.then(watcher => {
      this.watcher = watcher;
      this.start();
    });
  }

  public get files(): Signal<data.Files> { return this.filesCell };

  public update = (path: string, buffer: Buffer) => {
    this.updateFiles(files => {
      const oldFile = files.get(path);
      const lastUpdateMs = Date.now();
      if (oldFile) {
        const fileMetadata = this.filesMetadata.get(path) || bug(`expected metadata for ${path}`);
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
        this.filesMetadata.set(path, fileMetadata);
        const file = new data.File(path, Signal.cellOk(buffer, this.onChange));
        return files.set(path, file);
      }
    });
  }

  public delete = (path: string) => {
    this.updateFiles(files => {
      const lastUpdateMs = Date.now();
      const fileMetadata = this.filesMetadata.get(path) || bug(`delete: expected metadata for ${path}`);
      fileMetadata.lastUpdateMs = lastUpdateMs;
      return files.delete(path);
    });
  }

  public rename = (oldPath: string, newPath: string) => {
    this.updateFiles(files => {
      if (oldPath === newPath) return files;
      const lastUpdateMs = Date.now();

      const oldFile = files.get(oldPath) ?? bug(`rename: expected file for ${oldPath}`);
      const oldFileMetadata = this.filesMetadata.get(oldPath) ?? bug(`rename: expected metadata for ${oldPath}`);
      oldFileMetadata.lastUpdateMs = lastUpdateMs;
      files = files.delete(oldPath);

      const newFile = files.get(newPath);
      if (newFile) {
        const newFileMetadata = this.filesMetadata.get(newPath) ?? bug(`rename: expected metadata for ${newPath}`);
        newFileMetadata.lastUpdateMs = lastUpdateMs;
        newFile.bufferCell.setOk(oldFile.bufferCell.get());
      } else {
        const newFileMetadata = { lastUpdateMs, lastWriteMs: 0, writing: false };
        this.filesMetadata.set(newPath, newFileMetadata);
        const newFile = new data.File(newPath, Signal.cellOk(oldFile.bufferCell.get(), this.onChange));
        files = files.set(newPath, newFile);
      }

      return files;
    });
  }

  public exists = (path: string) => {
    return !!this.filesCell.get().get(path);
  }

  private deleteMissing(events: NsfwEvent[]) {
    const seen = new Set<string>();
    events.forEach(ev => {
      switch (ev.action) {
        case 0:
          seen.add(canonizePath(this.filesPath, ev.directory, ev.file));
          break;

        default: bug(`expected add`);
      }
    });
    this.updateFiles(files =>
      files.filter((_, path) => seen.has(path))
    );
  }

  public start = async () => {
    if (!this.watcher) return; // don't walk dir twice on startup
    if (debug) console.log(`Filesystem.start`);
    const events: Array<NsfwEvent> = [];
    // TODO(jaked) needs protecting against concurrent updates
    await this.walkDir(this.filesPath, events);
    await this.handleNsfwEvents(events);
    this.deleteMissing(events);
    this.timeout = Timers.setInterval(this.timerCallback, 1000);
    this.watcher.start();
  }

  public stop = () => {
    if (debug) console.log(`Filesystem.stop`);
    // TODO(jaked) ensure no updates after final write
    this.timerCallback(true);
    if (this.timeout) Timers.clearInterval(this.timeout);
    if (this.watcher) this.watcher.stop()
  }

  private shouldWrite = (path: string, fileMetadata: FileMetadata, force: boolean) => {
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

  private timerCallback = (force = false) => {
    if (debug) console.log(`timerCallback`);
    this.filesMetadata.forEach((fileMetadata, path) => {
      if (this.shouldWrite(path, fileMetadata, force)) {
        fileMetadata.writing = true;

        const lastWriteMs = Date.now();
        const file = this.filesCell.get().get(path);
        if (file) {
          if (debug) console.log(`writeFile(${path})`);
          Fs.writeFile(Path.join(this.filesPath, path), file.bufferCell.get())
            .finally(() => {
              fileMetadata.lastWriteMs = lastWriteMs;
              fileMetadata.writing = false;
            });
        } else {
          if (debug) console.log(`unlink(${path})`);
          Fs.unlink(Path.join(this.filesPath, path))
            .finally(() => {
              fileMetadata.lastWriteMs = lastWriteMs;
              fileMetadata.writing = false;
            });
        }
      }
    });
  };

  private walkDir = async (directory: string, events: Array<NsfwEvent>) => {
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
        return this.walkDir(dirFile, events);
      } else throw new Error(`unhandled file type for '${dirFile}'`);
    }));
  }

  handleNsfwError = (error) => {
    console.log(error);
    throw error;
  }

  updateFiles = (
    updater: (files: Immutable.Map<string, data.File>) => Immutable.Map<string, data.File>
  ) => {
    const files = updater(this.filesCell.get());
    this.filesCell.setOk(files);
  }

  updateFile = (
    files: Immutable.Map<string, data.File>,
    path: string,
    buffer: Buffer
  ): Immutable.Map<string, data.File> => {
    const now = Date.now();
    const oldFile = files.get(path);
    if (oldFile) {
      if (debug) console.log(`${path} has oldFile`);
      const fileMetadata = this.filesMetadata.get(path) || bug(`expected metadata for ${path}`);
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
      this.filesMetadata.set(path, fileMetadata);
      const file = new data.File(path, Signal.cellOk(buffer, this.onChange));
      return files.set(path, file);
    }
  }

  handleNsfwEvents = async (nsfwEvents: Array<NsfwEvent>) => {
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

    this.updateFiles(files => {
      // defer deletions to account for delete/add
      // TODO(jaked) rethink this
      const deleted = new Set<string>();
      files =
        events.reduce((files, [ ev, buffer ]) => {
          switch (ev.action) {
            case 0:   // created
            case 2: { // modified
              const path = canonizePath(this.filesPath, ev.directory, ev.file);
              deleted.delete(path);
              return this.updateFile(files, path, buffer);
            }

            case 3: { // renamed
              const oldPath = canonizePath(this.filesPath, (ev as any).directory, ev.oldFile);
              deleted.add(oldPath);
              const path = canonizePath(this.filesPath, ev.newDirectory, ev.newFile);
              return this.updateFile(files, path, buffer);
            }
            case 1:
              const oldPath = canonizePath(this.filesPath, ev.directory, ev.file);
              deleted.add(oldPath);
              return files;
          }
        }, files);

      deleted.forEach(path => { files = files.delete(path) });
      return files;
    });
  }
}
