import * as util from "util";
import * as fs from "fs";

import { FSWatcher } from 'chokidar';

import * as data from '../data';

const readFile = util.promisify(fs.readFile);

type SetNotesState = (updateNotes: (notes: data.Notes) => data.Notes) => void

export class Watcher {
  watcher: FSWatcher;
  setNotesState: SetNotesState;

  constructor(setNotesState: SetNotesState) {
    this.setNotesState = setNotesState;

    this.handleAdd = this.handleAdd.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.handleUnlink = this.handleUnlink.bind(this)

    this.watcher = new FSWatcher()
      .on('add', this.handleAdd)
      .on('change', this.handleChange)
      .on('unlink', this.handleUnlink);
  }

  watch() {
    this.watcher.add('docs')
  }

  async handleAdd(path: string, stats: fs.Stats) {
    const content = await readFile(path, { encoding: 'utf8' })
    this.setNotesState(function(notes: data.Notes) {
      notes.push(
        { tag: path, content: content }
      )
      return notes;
    });
  }

  async handleChange(path: string, stats: fs.Stats) {
    const content = await readFile(path, { encoding: 'utf8' })
    this.setNotesState(notes =>
      notes.map(note =>
        (note.tag === path) ?
        { tag: note.tag, content: content } :
        note
      )
    )
  }

  handleUnlink(path: string, stats: fs.Stats) {
    this.setNotesState(notes =>
      notes.filter(({ tag }) => tag !== path)
    )
  }
}