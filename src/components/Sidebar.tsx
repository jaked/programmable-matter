import * as Immutable from 'immutable';

import React from 'react';
import { Flex as BaseFlex } from 'rebass';
import styled from 'styled-components';

import * as Name from '../util/Name';
import Signal from '../util/Signal';
import { bug } from '../util/bug';

import Notes from './Notes';
import SearchBox from './SearchBox';
import * as data from '../data';

type Props = {
  render: () => void;
  compiledNotes: Signal<data.CompiledNotes>;
  selected: Signal<string | null>;
  onSelect: (s: string | null) => void;
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
        const matches = Signal.label('matches',
          Signal.joinImmutableMap(Signal.ok(focusDirNotes.map(matchesSearch)))
            .map(map => map.filter(([bool, note]) => bool).map(([bool, note]) => note)
          )
        );

        // include parents of matching notes
        matchingNotes = Signal.label('matchingNotes',
          matches.map(matches => matches.withMutations(map => {
            matches.forEach((_, name) => {
              if (focusDir) {
                name = Name.relative(focusDir, name);
              }
              const dirname = Name.dirname(name);
              if (dirname != '.') {
                const dirs = dirname.split('/');
                let dir = '';
                for (let i=0; i < dirs.length; i++) {
                  dir = Name.join(dir, dirs[i]);
                  if (!map.has(dir)) {
                    const note = notes.get(dir) || bug(`expected note for ${dir}`);
                    map.set(dir, note);
                  }
                }
              }
            });
          }))
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
      searchCell,
      dirExpandedCell,
      focusDirCell
    ).map(([selected, matchingNotes, search, dirExpanded, focusDir]) => {
      const matchingNotesTree: Array<data.CompiledNote & { indent: number, expanded?: boolean }> = [];
      const expandAll = search.length >= 3;
      matchingNotes.forEach(note => {
        // TODO(jaked) this code is bad
        let name = note.name;
        if (focusDir) {
          name = Name.relative(focusDir, name);
        }
        const dirname = Name.dirname(name);
        let showNote = true;
        let indent = 0;
        if (dirname !== '.') {
          const dirs = dirname.split('/');
          indent = dirs.length;
          let dir = '';
          for (let i = 0; i < dirs.length; i++) {
            dir = Name.join(dir, dirs[i]);
            if (focusDir) {
              dir = Name.join(focusDir, dir);
            }
            if (!expandAll && !dirExpanded.get(dir, false)) showNote = false;
          }
          if (selected && selected.startsWith(note.name))
            showNote = true;
        }
        if (focusDir) indent += 1;
        if (showNote) {
          let expanded: boolean | undefined = undefined;
          if (note.isIndex) {
            expanded = expandAll ? true : dirExpanded.get(note.name, false);
          }
          matchingNotesTree.push({ ...note, indent, expanded });
        }
      });
      return matchingNotesTree;
    })
  );

  const onKeyDown = Signal.join(
    searchCell,
    props.compiledNotes,
    matchingNotesSignal,
    props.onNewNote,
  ).map(([search, compiledNotes, matchingNotes, onNewNote]) =>
    (e: React.KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
        return;

      switch (e.key) {
        case 'ArrowUp':
          focusNotes();
          props.onSelect(matchingNotes[matchingNotes.length - 1].name);
          e.preventDefault();
          break;

        case 'ArrowDown':
          focusNotes();
          props.onSelect(matchingNotes[0].name);
          e.preventDefault();
          break;

        case 'Enter':
          if (compiledNotes.some((_, name) => name === search)) {
            props.onSelect(search);
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
      onSelect={props.onSelect}
    />
    <Notes
      ref={notesRef}
      notes={matchingNotesTreeSignal}
      selected={props.selected}
      onSelect={props.onSelect}
      onFocusDir={setFocusDir}
      focusEditor={props.focusEditor}
      toggleDirExpanded={toggleDirExpanded}
    />
  </>);
}));

export default Sidebar;
