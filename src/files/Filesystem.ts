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
  deleted: boolean;
};

const debug = false;

const emptyBuffer = Buffer.from('');

type NsfwEvent =
  {
    action: 0 | 1 | 2; // created, deleted, modified
    directory: string;
    file: string;
  } |
  {
    action: 3; // renamed
    directory: string;
    oldFile: string;
    newDirectory: string;
    newFile: string;
  }

function canonizePath(filesPath: string, directory: string, file: string) {
  return Path.relative(filesPath, Path.resolve(directory, file));
}

export class Filesystem {
  private filesPath: string;
  private onChange: () => void;
  private filesCell: Signal.Cell<Immutable.Map<string, Signal.Cell<data.File>>>;
  private filesMetadata: Map<string, FileMetadata> = new Map();
  private timeout: NodeJS.Timeout;
  private watcher: any;

  public constructor(filesPath: string, onChange: () => void) {
    this.filesPath = filesPath;
    this.onChange = onChange;
    this.filesCell = Signal.cellOk(Immutable.Map(), onChange);
    this.timeout = Timers.setInterval(this.timerCallback, 500);
    this.watcher = new Nsfw(
      500, // debounceMS
      this.filesPath,
      this.handleNsfwEvents,
      this.handleNsfwError
    );
  }

  public get files(): Signal<data.Files> { return this.filesCell };

  public update = (path: string, buffer: Buffer) => {
    this.updateFiles(files => {
      const oldFileCell = files.get(path);
      const lastUpdateMs = Date.now(); // TODO(jaked) not sure how accurate this is
      if (oldFileCell) {
        const oldFile = oldFileCell.get();
        const fileMetadata = this.filesMetadata.get(path) || bug(`expected metadata for ${path}`);
        if (buffer.equals(oldFile.buffer)) {
          if (debug) console.log(`${path} has not changed`);
          return files;
        } else {
          if (debug) console.log(`updating file path=${path}`);
          fileMetadata.lastUpdateMs = lastUpdateMs;
          const version = oldFile.version + 1;
          const file = { ...oldFile, version, buffer };
          oldFileCell.setOk(file);
          return files;
        }
      } else {
        if (debug) console.log(`new file path=${path}`);
        const fileMetadata = { lastUpdateMs, lastWriteMs: 0, writing: false, deleted: false };
        this.filesMetadata.set(path, fileMetadata);
        const file = { path, version: 0, buffer }
        return files.set(path, Signal.cellOk(file, this.onChange));
      }
    });
  }

  public delete = (path: string) => {
    this.updateFiles(files => {
      const lastUpdateMs = Date.now();
      const fileMetadata = this.filesMetadata.get(path) || bug(`delete: expected metadata for ${path}`);
      fileMetadata.deleted = true;
      fileMetadata.lastUpdateMs = lastUpdateMs;
      return files.delete(path);
    });
  }

  public start = async () => {
    const events: Array<NsfwEvent> = [];
    await this.walkDir(this.filesPath, events);
    await this.handleNsfwEvents(events);
    this.watcher.start();
  }

  public stop = () => {
    this.watcher.stop()
  }

  private shouldWrite = (path: string, fileMetadata: FileMetadata) => {
    // we're in the middle of a write
    if (fileMetadata.writing) {
      if (debug) console.log(`shouldWrite(${path}): false because file.writing`);
      return false;
    }

    // the current in-memory file is already written
    if (fileMetadata.lastWriteMs >= fileMetadata.lastUpdateMs) {
      if (debug) console.log(`shouldWrite(${path}): false because already written`);
      return false;
    }

    const now = Date.now();

    // there's been no update in 500 ms
    if (now > fileMetadata.lastUpdateMs + 500) {
      if (debug) console.log(`shouldWrite(${path}): true because no update in 500 ms`);
      return true;
    }

    // the file hasn't been written in 5 s
    if (Date.now() > fileMetadata.lastWriteMs + 5000) {
      if (debug) console.log(`shouldWrite(${path}): true because no write in 5 s`);
      return true;
    }

    if (debug) console.log(`shouldWrite(${path}): false because otherwise`);
    return false;
  }

  private timerCallback = () => {
    this.filesMetadata.forEach((fileMetadata, path) => {
      if (this.shouldWrite(path, fileMetadata)) {
        fileMetadata.writing = true;

        const lastWriteMs = Date.now();
        const fileCell = this.filesCell.get().get(path);
        if (fileCell) {
          if (debug) console.log(`writeFile(${path})`);
          Fs.writeFile(Path.resolve(this.filesPath, path), fileCell.get().buffer)
            .finally(() => {
              fileMetadata.lastWriteMs = lastWriteMs;
              fileMetadata.writing = false;
            });
        } else {
          if (debug) console.log(`unlink(${path})`);
          Fs.unlink(Path.resolve(this.filesPath, path))
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
    updater: (files: Immutable.Map<string, Signal.Cell<data.File>>) => Immutable.Map<string, Signal.Cell<data.File>>
  ) => {
    const files = updater(this.filesCell.get());
    this.filesCell.setOk(files);
  }

  updateFile = (
    files: Immutable.Map<string, Signal.Cell<data.File>>,
    path: string,
    buffer: Buffer
  ): Immutable.Map<string, Signal.Cell<data.File>> => {
    const now = Date.now();
    const oldFileCell = files.get(path);
    if (oldFileCell) {
      if (debug) console.log(`${path} has oldFile`);
      const oldFile = oldFileCell.get();
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
      if (buffer.equals(oldFile.buffer)) {
        if (debug) console.log(`${path} has not changed`);
        return files;
      }

      if (debug) console.log(`updating ${path}`);
      fileMetadata.lastUpdateMs = now;
      fileMetadata.lastWriteMs = now;
      const file = { ...oldFile,
        version: oldFile.version + 1,
        buffer
      };
      oldFileCell.setOk(file);
      return files;
    } else {
      if (debug) console.log(`adding ${path}`);
      const fileMetadata =
        { lastUpdateMs: now, lastWriteMs: now, writing: false, deleted: false };
      this.filesMetadata.set(path, fileMetadata);
      const file = {
        path,
        version: 0,
        buffer,
      }
      return files.set(path, Signal.cellOk(file, this.onChange));
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
            if (debug) console.log(`${ev.directory} / ${ev.oldFile} was renamed to ${ev.newFile}`);
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
              const oldPath = canonizePath(this.filesPath, ev.directory, ev.oldFile);
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
