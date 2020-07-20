import * as Immutable from 'immutable';

import React from 'react';
import { Flex as BaseFlex } from 'rebass';
import styled from 'styled-components';

import * as Name from '../util/Name';
import Signal from '../util/Signal';

import Notes from './Notes';
import SearchBox from './SearchBox';
import * as data from '../data';

export type NoteTreeEntry =
  { type: 'note', indent: number, note: data.CompiledNote } |
  { type: 'dir', indent: number, name: string, expanded: boolean }
;

export type NoteTree = Array<NoteTreeEntry>;

type Props = {
  render: () => void;
  compiledNotes: Signal<data.CompiledNotes>;
  selected: Signal<string | null>;
  setSelected: (s: string | null) => void;
  maybeSetSelected: (s: string) => boolean;
  onNewNote: Signal<(s: string) => void>;
  focusEditor: () => void;
}

const Flex = styled(BaseFlex)`
  :hover {
    cursor: pointer;
  }
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
`;

type FocusDir = {
  focusDir: string | null;
  setFocusDir: (dir: string | null) => void;
  onSelect: (name: string | null) => void;
}

const FocusDir = Signal.lift<FocusDir>(props => {
  if (props.focusDir !== null)
    return (
      <Flex
        padding={2}
        onClick={() => props.onSelect(props.focusDir) }
      >
        <div onClick={e => { props.setFocusDir(null); e.stopPropagation() } } style={{ minWidth: '10px' }}>x</div>
        <div>{props.focusDir}</div>
      </Flex>
    );
  else
    return null;
});


type Sidebar = {
  focusSearchBox: () => void;
  focusNotes: () => void;
}

const Sidebar = React.memo(React.forwardRef<Sidebar, Props>((props, ref) => {
  const notesRef = React.useRef<HTMLDivElement>(null);
  const searchBoxRef = React.useRef<SearchBox>(null);

  const focusSearchBox =
    () => searchBoxRef.current && searchBoxRef.current.focus();
  const focusNotes =
    () => notesRef.current && notesRef.current.focus();
  React.useImperativeHandle(ref, () => ({
    focusSearchBox,
    focusNotes,
  }));

  const focusDirCell = Signal.cellOk<string | null>(null, props.render);
  const setFocusDir = (focus: string | null) => {
    focusDirCell.setOk(focus);
  }

  const searchCell = Signal.cellOk<string>('', props.render);
  const setSearch = (search: string) => {
    searchCell.setOk(search);
  }

  const dirExpandedCell = Signal.cellOk(Immutable.Map<string, boolean>(), props.render);
  const toggleDirExpanded = (dir: string) => {
    dirExpandedCell.update(dirExpanded => {
      const flag = dirExpanded.get(dir, false);
      return dirExpanded.set(dir, !flag);
    });
  }

  const matchingNotesSignal = Signal.label('matchingNotes',
    Signal.join(
      // TODO(jaked)
      // map matching function over individual note signals
      // so we only need to re-match notes that have changed
      props.compiledNotes,
      focusDirCell,
      searchCell,
    ).flatMap(([notes, focusDir, search]) => {

      let focusDirNotes: data.CompiledNotes;
      if (focusDir) {
        focusDirNotes = notes.filter((_, name) => name.startsWith(focusDir + '/'))
      } else {
        focusDirNotes = notes;
      }

      let matchingNotes: Signal<data.CompiledNotes>;
      if (search) {
        // https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
        const escaped = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
        const regexp = RegExp(escaped, 'i');

        function matchesSearch(note: data.CompiledNote): Signal<[boolean, data.CompiledNote]> {
          return Signal.label(note.name,
            Signal.join(
              note.files.mdx ? note.files.mdx.content.map(mdx => regexp.test(mdx)) : Signal.ok(false),
              note.files.json ? note.files.json.content.map(json => regexp.test(json)) : Signal.ok(false),
              note.meta.map(meta => !!(meta.tags && meta.tags.some(tag => regexp.test(tag)))),
              Signal.ok(regexp.test(note.name)),
            ).map(bools => [bools.some(bool => bool), note])
          );
        }
        // TODO(jaked) wrap this up in a function on Signal
        matchingNotes = Signal.label('matches',
          Signal.joinImmutableMap(Signal.ok(focusDirNotes.map(matchesSearch)))
            .map(map => map.filter(([bool, note]) => bool).map(([bool, note]) => note)
          )
        );
      } else {
        matchingNotes = Signal.ok(focusDirNotes);
      }

      return Signal.label('sort',
        matchingNotes.map(matchingNotes => matchingNotes.valueSeq().toArray().sort((a, b) =>
          a.name < b.name ? -1 : 1
        ))
      );
    })
  );

  const matchingNotesTreeSignal = Signal.label('matchingNotesTree',
    Signal.join(
      props.selected,
      matchingNotesSignal,
      dirExpandedCell,
    ).map(([selected, matchingNotes, dirExpanded]) => {
      const matchingNotesTree: NoteTree = [];
      const seenDirs = new Set<string>();
      matchingNotes.forEach(note => {
        let name = note.name;
        const dirname = Name.dirname(name);
        if (dirname === '/') {
          matchingNotesTree.push({ type: 'note', note, indent: 0 });
        } else {
          const mustShow = selected === note.name;
          const dirs = dirname.substr(1).split('/');
          let dir = '/';
          for (let i = 0; i < dirs.length; i++) {
            dir = Name.join(dir, dirs[i]);
            const expanded = dirExpanded.get(dir, false);
            if (!seenDirs.has(dir)) {
              seenDirs.add(dir);
              matchingNotesTree.push({ type: 'dir', name: dir, indent: i, expanded });
            }
            if (!expanded && !mustShow)
              return;
          }
          matchingNotesTree.push({ type: 'note', note, indent: dirs.length });
        }
      });
      return matchingNotesTree;
    })
  );

  const onKeyDown = Signal.join(
    searchCell,
    matchingNotesSignal,
    props.onNewNote,
  ).map(([search, matchingNotes, onNewNote]) =>
    (e: React.KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
        return;

      switch (e.key) {
        // TODO(jaked) restore
        // case 'ArrowUp':
        //   focusNotes();
        //   props.setSelected(matchingNotes[matchingNotes.length - 1].name);
        //   e.preventDefault();
        //   break;

        // case 'ArrowDown':
        //   focusNotes();
        //   props.setSelected(matchingNotes[0].name);
        //   e.preventDefault();
        //   break;

        case 'Enter':
          if (props.maybeSetSelected(search)) {
            props.focusEditor();
          } else {
            onNewNote(search);
          }
          e.preventDefault();
          break;
      }
    }
  );

  return (<>
    <SearchBox
      ref={searchBoxRef}
      search={searchCell}
      onSearch={setSearch}
      onKeyDown={onKeyDown}
      onNewNote={props.onNewNote}
    />
    <FocusDir
      focusDir={focusDirCell}
      setFocusDir={setFocusDir}
      onSelect={props.setSelected}
    />
    <Notes
      ref={notesRef}
      entries={matchingNotesTreeSignal}
      selected={props.selected}
      onSelect={props.setSelected}
      onFocusDir={setFocusDir}
      focusEditor={props.focusEditor}
      toggleDirExpanded={toggleDirExpanded}
    />
  </>);
}));

export default Sidebar;
