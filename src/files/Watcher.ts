import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

import nsfw from 'nsfw';

import * as data from '../data';

const readdir = util.promisify(fs.readdir)
const readFile = util.promisify(fs.readFile);
const stat = util.promisify(fs.stat);

const debug = false;

type SetFilesState = (updateFiles: (files: data.Files) => data.Files) => void

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
  return path.relative(filesPath, path.resolve(directory, file));
}

function updateFile(
  files: data.Files,
  path: string,
  buffer: string
): data.Files {
  const oldFile = files.get(path);

  // TODO(jaked) when we switch to Buffer, use correct equality
  if (oldFile && oldFile.buffer === buffer) {
    return files;
  }

  const file = {
    path,
    version: oldFile ? oldFile.version + 1 : 0,
    buffer
  }
  return files.set(path, file);
}

export class Watcher {
  filesPath: string;
  watcher: any;
  setFilesState: SetFilesState;

  constructor(
    filesPath: string,
    setFilesState: SetFilesState
  ) {
    this.filesPath = filesPath;
    this.setFilesState = setFilesState;

    this.handleNsfwEvents = this.handleNsfwEvents.bind(this)
    this.handleNsfwError = this.handleNsfwError.bind(this)

    this.watcher = new nsfw(
      500, // debounceMS
      this.filesPath,
      this.handleNsfwEvents,
      this.handleNsfwError
    )
  }

  async start() {
    const events: Array<NsfwEvent> = [];
    async function walkDir(directory: string, events: Array<NsfwEvent>) {
      const dirents = await readdir(directory, { encoding: 'utf8'});
      return Promise.all(dirents.map(async function (file: string) {
        const dirFile = path.resolve(directory, file);
        const stats = await stat(dirFile);
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
    await walkDir(this.filesPath, events);
    await this.handleNsfwEvents(events);
    this.watcher.start();
  }

  stop() {
    this.watcher.stop()
  }

  handleNsfwError(error) {
    console.log(error);
    throw error;
  }

  async handleNsfwEvents(nsfwEvents: Array<NsfwEvent>) {
    function readBuffer(directory: string, file: string) {
      return readFile(
        path.resolve(directory, file),
        { encoding: 'utf8' }
      );
    }

    const events = await Promise.all(
      nsfwEvents.map(async function(ev: NsfwEvent): Promise<[ NsfwEvent, string ]> {
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
            return [ ev, '' ];
          }
        }
      })
    )

    this.setFilesState((files: data.Files) => {
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
              return updateFile(files, path, buffer);
            }

            case 3: { // renamed
              const oldPath = canonizePath(this.filesPath, ev.directory, ev.oldFile);
              deleted.add(oldPath);
              const path = canonizePath(this.filesPath, ev.newDirectory, ev.newFile);
              return updateFile(files, path, buffer);
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
