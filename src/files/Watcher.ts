import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

import nsfw from 'nsfw';

import * as data from '../data';

const readdir = util.promisify(fs.readdir)
const readFile = util.promisify(fs.readFile);
const stat = util.promisify(fs.stat);

const debug = false;

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

export class Watcher {
  notesPath: string;
  watcher: any;
  setNotesState: SetNotesState;

  constructor(
    notesPath: string,
    setNotesState: SetNotesState
  ) {
    this.notesPath = notesPath;
    this.setNotesState = setNotesState;

    this.handleNsfwEvents = this.handleNsfwEvents.bind(this)
    this.handleNsfwError = this.handleNsfwError.bind(this)

    this.watcher = new nsfw(
      500, // debounceMS
      this.notesPath,
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
        if (debug)
          console.log(`${directory} / ${file}`);
        if (stats.isFile()) {
          if (debug) console.log('isFile');
          events.push({ action: 0, file, directory });
        } else if (stats.isDirectory()) {
          if (debug) console.log('isDirectory');
          return walkDir(dirFile, events);
        } else throw new Error(`unhandled file type for '${dirFile}'`);
      }));
    }
    await walkDir(this.notesPath, events);
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
    function readContent(directory: string, file: string) {
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
            if (debug)
              console.log(`${ev.directory} / ${ev.file} was ${ev.action == 0 ? 'created' : 'modified'}`);
            const content = await readContent(ev.directory, ev.file);
            return [ ev, content ];
          }

          case 3: { // renamed
            if (debug)
              console.log(`${ev.directory} / ${ev.oldFile} was renamed to ${ev.newFile}`);
            const content = await readContent(ev.newDirectory, ev.newFile);
            return [ ev, content ];
          }

          case 1: { // deleted
            if (debug)
              console.log(`${ev.directory} / ${ev.file} was deleted`);
            return [ ev, '' ];
          }
        }
      })
    )

    const notesPath = this.notesPath;
    this.setNotesState(function (notes: data.Notes) {

      function noteTag(directory: string, file: string) {
        const ext = path.extname(file);
        const base = path.basename(file, ext);
        return path.relative(
          notesPath,
          path.resolve(directory, base)
        );
      }

      function updateNote(notes: data.Notes, dir: string, file: string, content: string) {
        const tag = noteTag(dir, file);
        const ext = path.extname(file);
        // TODO(jaked) this doesn't work for some reason
        // let type: 'mdx' | 'txt' | 'json';
        let type;
        switch (ext) {
          case '': type = 'mdx'; break;
          case '.txt': type = 'txt'; break;
          case '.md': type = 'mdx'; break; // TODO(jaked) support MD without X
          case '.mdx': type = 'mdx'; break;
          case '.json': type = 'json'; break;
          default:
            console.log(`unhandled extension '${ext}' for '${path.resolve(dir, tag)}'`);
            return notes;
        }
        const oldNote = notes.get(tag);
        const note = {
          path: path.resolve(dir, file),
          tag,
          type,
          content,
          version: oldNote ? oldNote.version + 1 : 0
        }
        return notes.set(tag, note);
      }

      function deleteNote(notes: data.Notes, tag: string) {
        return notes.delete(tag);
      }

      // defer deletions to account for delete/add
      // TODO(jaked) rethink this
      const deleted = new Set<string>();
      notes =
        events.reduce((notes, [ ev, content ]) => {
          switch (ev.action) {
            case 0:   // created
            case 2: { // modified
              const tag = noteTag(ev.directory, ev.file);
              deleted.delete(tag);
              return updateNote(notes, ev.directory, ev.file, content);
            }

            case 3: { // renamed
              deleted.add(noteTag(ev.directory, ev.oldFile));
              return updateNote(notes, ev.newDirectory, ev.newFile, content);
            }
            case 1:
              deleted.add(noteTag(ev.directory, ev.file));
              return notes;
          }
        }, notes);

      deleted.forEach(tag => { notes = deleteNote(notes, tag) });
      return notes;
    });
  }
}
