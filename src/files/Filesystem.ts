import { promises as Fs } from 'fs';
import * as Path from 'path';
import * as Timers from 'timers';
import * as Immutable from 'immutable';
import Nsfw from 'nsfw';
import Signal from '../util/Signal';
import * as data from '../data';

type InternalFile = data.File & {
  writing: boolean; // true if we are in the middle of writing the file
  lastUpdateMs: number; // timestamp of last in-memory update
  lastWriteMs: number; // timestamp of last write to underlying filesystem
};

type InternalFiles = Immutable.Map<string, InternalFile>

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
  private filesCell = Signal.cellOk<InternalFiles>(Immutable.Map());
  private timeout: NodeJS.Timeout;
  private watcher: any;

  public constructor(filesPath: string, onChange: () => void) {
    this.filesPath = filesPath;
    this.onChange = onChange;
    this.timeout = Timers.setInterval(this.timerCallback, 500);
    this.watcher = new Nsfw(
      500, // debounceMS
      this.filesPath,
      this.handleNsfwEvents,
      this.handleNsfwError
    );
  }

  public files: Signal<data.Files> = this.filesCell;

  public update = (path: string, buffer: Buffer) => {
    this.updateFiles(files => {
      const oldFile = files.get(path);
      let file: InternalFile;
      const lastUpdateMs = Date.now(); // TODO(jaked) not sure how accurate this is
      if (oldFile) {
        if (buffer.equals(oldFile.buffer)) {
          if (debug) console.log(`${path} has not changed`);
          return files;
        } else {
          if (debug) console.log(`updating file path=${path}`);
          const version = oldFile.version + 1;
          file = Object.assign({}, oldFile, { version, buffer, lastUpdateMs })
        }
      } else {
        if (debug) console.log(`new file path=${path}`);
        file = { path, version: 0, buffer, writing: false, lastUpdateMs, lastWriteMs: 0 }
      }
      return files.set(path, file);
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

  private shouldWrite = (file: InternalFile) => {
    // we're in the middle of a write
    if (file.writing) {
      if (debug) console.log(`shouldWrite(${file.path}): false because file.writing`);
      return false;
    }

    // the current in-memory file is already written
    if (file.lastWriteMs >= file.lastUpdateMs) {
      if (debug) console.log(`shouldWrite(${file.path}): false because already written`);
      return false;
    }

    const now = Date.now();

    // there's been no update in 500 ms
    if (now > file.lastUpdateMs + 500) {
      if (debug) console.log(`shouldWrite(${file.path}): true because no update in 500 ms`);
      return true;
    }

    // the file hasn't been written in 5 s
    if (Date.now() > file.lastWriteMs + 5000) {
      if (debug) console.log(`shouldWrite(${file.path}): true because no write in 5 s`);
      return true;
    }

    if (debug) console.log(`shouldWrite(${file.path}): false because otherwise`);
    return false;
  }

  private timerCallback = () => {
    this.updateFiles(files => {
      files.forEach(file => {
        if (this.shouldWrite(file)) {
          file = Object.assign({}, file, { writing: true });
          files = files.set(file.path, file);

          const lastWriteMs = Date.now();
          const filePath = file.path;
          if (debug) console.log(`before writeFile ${filePath}`);
          Fs.writeFile(Path.resolve(this.filesPath, filePath), file.buffer)
            .finally(
              () => {
                if (debug) console.log(`finally ${filePath}`);
                let files = this.filesCell.get();
                let file = files.get(filePath);
                if (file) {
                  if (debug) console.log(`file.writing = ${file.writing} for ${file.path}`);
                  file = Object.assign({}, file, { lastWriteMs, writing: false })
                  files = files.set(filePath, file);
                  this.filesCell.setOk(files);
                }
              });
          if (debug) console.log(`after writeFile ${filePath}`);
        }
      });
      return files;
    }, false);
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
    updater: (files: InternalFiles) => InternalFiles,
    triggerChange: boolean = true
  ) => {
    const files = updater(this.filesCell.get());
    if (files !== this.filesCell.get()) {
      if (debug) console.log(`updating filesCell`)
      this.filesCell.setOk(files);
      if (triggerChange) this.onChange();
    }
  }

  updateFile = (
    files: InternalFiles,
    path: string,
    buffer: Buffer
  ): InternalFiles => {
    const now = Date.now();
    const oldFile = files.get(path);
    if (oldFile) {
      if (debug) console.log(`${path} has oldFile`);
      // we just wrote the file, this is most likely a notification
      // of that write, so skip it.
      // TODO(jaked) should check this before reading file.
      if (oldFile.writing) {
        if (debug) console.log(`${path} is being written`);
        return files;
      }
      if (Date.now() < oldFile.lastWriteMs + 5000) {
        if (debug) console.log(`${path} was just written`);
        return files;
      }
      if (buffer.equals(oldFile.buffer)) {
        if (debug) console.log(`${path} has not changed`);
        return files;
      }

      if (debug) console.log(`updating ${path}`);
      const file = Object.assign({}, oldFile, {
        version: oldFile.version + 1,
        buffer,
        lastUpdateMs: now,
        lastWriteMs: now,
      });
      return files.set(path, file);
    } else {
      if (debug) console.log(`adding ${path}`);
      const file = {
        path,
        version: 0,
        buffer,
        lastUpdateMs: now,
        lastWriteMs: now,
        writing: false,
      }
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
