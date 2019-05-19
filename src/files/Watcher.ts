import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import * as util from 'util';

import nsfw from 'nsfw';

import * as data from '../data';

// TODO(jaked)
const ROOT = process.cwd();

const readFile = util.promisify(fs.readFile);

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
    const dir = path.resolve(ROOT, 'docs');
    const dirents = await util.promisify(fs.readdir)(dir, { encoding: 'utf8'});
    const events: Array<NsfwEvent> =
      dirents.map(function (file) {
        return {
          action: 0, // add
          file: file,
          directory: dir,
        };
      });
    await this.handleNsfwEvents(events);
    this.watcher.start();
  }

  stop() {
    this.watcher.stop()
  }

  handleNsfwError(error) {
    throw error;
  }

  async handleNsfwEvents(events: Array<NsfwEvent>) {
    const eventContents = await Promise.all(
      events.map(function(event: NsfwEvent): Promise<[NsfwEvent, string]> {
        switch (event.action) {
          case 0: // created
          case 2: // modified
            return readFile(
              path.resolve(event.directory, event.file),
              { encoding: 'utf8' }
            ).then(contents => [event, contents]);
          default:
            return Promise.resolve([event, '']);
        }
      })
    )

    this.setNotesState(function (notes: data.Notes) {

      function updateNote(notes: data.Notes, tag: string, content: string) {
        const note = notes.get(tag);
        const version = note ? note.version + 1 : 0;
        return notes.set(tag, { tag, content, version });
      }

      function deleteNote(notes: data.Notes, tag: string) {
        return notes.delete(tag);
      }

      // defer deletions to account for delete/add
      // TODO(jaked) rethink this
      const deleted = new Set<string>();
      notes =
        eventContents.reduce((notes, [event, content]) => {
          switch (event.action) {
            case 0: // created
            case 2: // modified
              deleted.delete(event.file);
              return updateNote(notes, event.file, content);

            case 1: // deleted
              deleted.add(event.file);
              return notes;

            case 3: // renamed
              deleted.add(event.oldFile);
              return updateNote(notes, event.newFile, content);
          }
        }, notes);

      deleted.forEach(tag => { notes = deleteNote(notes, tag) });
      return notes;
    });
  }
}
