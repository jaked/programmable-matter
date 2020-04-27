import * as Immutable from 'immutable';
import React from 'react';

import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import { bug } from '../../util/bug';
import Type from '../Type';
import * as data from '../../data';

import compileFile from './compileFile';
import groupFilesByTag2 from './groupFilesByTag2';

const unimplementedSignal = Signal.err(new Error('unimplemented'));

export function compileFiles(
  trace: Trace,
  files: Signal<data.Files>,
  updateFile: (path: string, buffer: Buffer) => void,
  setSelected: (note: string) => void,
): { compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>, compiledNotes: Signal<data.CompiledNotes> } {

  const filesByTag = groupFilesByTag2(files);

  const compiledFilesRef = Signal.ref<Immutable.Map<string, Signal<data.CompiledFile>>>();

  const compiledNotesRef = Signal.ref<data.CompiledNotes>();

  const compiledFiles = Signal.mapImmutableMap(files, file =>
    compileFile(trace, file, compiledFilesRef, compiledNotesRef, updateFile, setSelected)
  );
  compiledFilesRef.set(compiledFiles);

  const compiledNotes: Signal<data.CompiledNotes> = Signal.mapImmutableMap(filesByTag, (files, tag) => {
    function compiledFileForType(type: data.Types): Signal<data.CompiledFile | undefined> {
      // TODO(jaked) fix tags for index files, then just use tag here instead of files
      const file = files.find(file => file.type === type);
      if (file) {
        return compiledFiles.flatMap(compiledFiles =>
          compiledFiles.get(file.path) ?? Signal.ok(undefined)
        );
      } else {
        return Signal.ok(undefined);
      }
    }

    // TODO(jaked) Signal.untuple
    const parts =
      Signal.join(
        compiledFileForType('meta'),
        compiledFileForType('mdx'),
        compiledFileForType('table'),
        compiledFileForType('json'),
      ).map(([meta, mdx, table, json]) => {
        let rendered: Signal<React.ReactNode>;
        if (mdx) rendered = mdx.rendered;
        else if (table) rendered = table.rendered;
        else if (json) rendered = json.rendered;
        else if (meta) rendered = meta.rendered;
        else bug(`expected compiled file for '${tag}'`);

        const problems =
          (mdx ? mdx.problems : false) ||
          (table ? table.problems : false) ||
          (json ? json.problems : false) ||
          (meta ? meta.problems : false);

        // TODO(jaked) merge exportType / exportValue across files
        let exportType: Type.ModuleType;
        if (mdx) exportType = mdx.exportType;
        else if (table) exportType = table.exportType;
        else if (json) exportType = json.exportType;
        else if (meta) exportType = meta.exportType;
        else bug(`expected compiled file for '${tag}'`);
        let exportValue: { [s: string]: Signal<any> };
        if (mdx) exportValue = mdx.exportValue;
        else if (table) exportValue = table.exportValue;
        else if (json) exportValue = json.exportValue;
        else if (meta) exportValue = meta.exportValue;
        else bug(`expected compiled file for '${tag}'`);

        return {
          problems,
          rendered,
          exportType,
          exportValue,
        };
      });
      return {
        tag,
        isIndex: false,
        meta: unimplementedSignal,
        files: { },
        problems: parts.map(parts => parts.problems),
        rendered: parts.flatMap(parts => parts.rendered),
        exportType: parts.map(parts => parts.exportType),
        exportValue: parts.map(parts => parts.exportValue),
      };
  });
  compiledNotesRef.set(compiledNotes);

  return { compiledFiles, compiledNotes };
}
