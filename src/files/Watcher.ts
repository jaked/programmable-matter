import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as util from 'util';

import nsfw from 'nsfw';

import * as data from '../data';

// TODO(jaked)
const ROOT = process.cwd();

const readdir = util.promisify(fs.readdir)
const readFile = util.promisify(fs.readFile);
const stat = util.promisify(fs.stat);

type SetNotesState = (updateNotes: (notes: data.Notes) => data.Notes) => void

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

type Event =
  {
    type: 'update',
    dir: string,
    base: string,
    ext: string,
    content: string
  } | {
    type: 'rename',
    dir: string,
    base: string,
    ext: string,
    content: string,
    oldDir: string,
    oldBase: string
  } | {
    type: 'delete',
    dir: string,
    base: string
  }

export class Watcher {
  watcher: any;
  setNotesState: SetNotesState;

  constructor(setNotesState: SetNotesState) {
    this.setNotesState = setNotesState;

    this.handleNsfwEvents = this.handleNsfwEvents.bind(this)
    this.handleNsfwError = this.handleNsfwError.bind(this)

    this.watcher = new nsfw(
      500, // debounceMS
      path.resolve(ROOT, 'docs'), // watch path
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
        if (stats.isFile())
          events.push({ action: 0, file, directory });
        else if (stats.isDirectory())
          return walkDir(dirFile, events);
        else throw new Error(`unhandled file type for '${dirFile}'`);
      }));
    }
    await walkDir(path.resolve(ROOT, 'docs'), events);
    await this.handleNsfwEvents(events);
    this.watcher.start();
  }

  stop() {
    this.watcher.stop()
  }

  handleNsfwError(error) {
    throw error;
  }

  async handleNsfwEvents(nsfwEvents: Array<NsfwEvent>) {
    function baseExt(file: string) {
      const ext = path.extname(file);
      const base = path.basename(file, ext);
      return [ base, ext ];
    }

    function readContent(directory: string, file: string) {
      return readFile(
        path.resolve(directory, file),
        { encoding: 'utf8' }
      );
    }

    const events = await Promise.all(
      nsfwEvents.map(async function(event: NsfwEvent): Promise<Event> {
        switch (event.action) {
          case 0:   // created
          case 2: { // modified
            const dir = event.directory;
            const [ base, ext ] = baseExt(event.file);
            const content = await readContent(dir, event.file);
            return { type: 'update', dir, base, ext, content };
          }

          case 3: { // renamed
            const dir = event.newDirectory;
            const [ base, ext ] = baseExt(event.newFile);
            const oldDir = event.directory;
            const oldBase = event.oldFile;
            const content = await readContent(dir, event.newFile);
            return { type: 'rename', dir, base, ext, content, oldDir, oldBase };
          }

          case 1: { // deleted
            const dir = event.directory;
            const [ base, ext ] = baseExt(event.file);
            return  { type: 'delete', dir, base };
          }
        }
      })
    )

    this.setNotesState(function (notes: data.Notes) {

      function updateNote(notes: data.Notes, dir: string, tag: string, ext: string, content: string) {
        const note = notes.get(tag);
        const version = note ? note.version + 1 : 0;
        const type: 'txt' | 'mdx' | 'json' = (() => {
          switch (ext) {
            case '': return 'mdx';
            case '.txt': return 'txt';
            case '.mdx': return 'mdx';
            case '.json': return 'json';
            default:
              throw new Error(`unhandled extension '${ext}' for '${path.resolve(dir, tag)}'`);
          }
        })();
        const meta = { type };
        return notes.set(tag, { dir, tag, meta, content, version });
      }

      function deleteNote(notes: data.Notes, tag: string) {
        return notes.delete(tag);
      }

      // defer deletions to account for delete/add
      // TODO(jaked) rethink this
      const deleted = new Set<string>();
      notes =
        events.reduce((notes, ev) => {
          switch (ev.type) {
            case 'update':
              deleted.delete(ev.base);
              return updateNote(notes, ev.dir, ev.base, ev.ext, ev.content);

            case 'delete':
              deleted.add(ev.base);
              return notes;

            case 'rename':
              deleted.add(ev.oldBase);
              return updateNote(notes, ev.dir, ev.base, ev.ext, ev.content);
          }
        }, notes);

      deleted.forEach(tag => { notes = deleteNote(notes, tag) });
      return notes;
    });
  }
}
