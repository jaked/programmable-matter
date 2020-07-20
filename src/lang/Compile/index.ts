import * as Path from 'path';
import * as Immutable from 'immutable';
import React from 'react';

import Signal from '../../util/Signal';
import * as Name from '../../util/Name';
import Type from '../Type';
import * as data from '../../data';

import compileFile from './compileFile';
import groupFilesByName from './groupFilesByName';
import metaForPath from './metaForPath';

function mergeModuleType(
  t1: Type.ModuleType,
  t2: Type.ModuleType,
): Type.ModuleType {
  return Type.module({
    ...t1.fields.reduce((obj, { _1: field, _2: type }) => ({ ...obj, [field]: type }), {}),
    ...t2.fields.reduce((obj, { _1: field, _2: type }) => ({ ...obj, [field]: type }), {}),
  });
}

function mergeModuleValue(
  v1: { [s: string]: Signal<any> },
  v2: { [s: string]: Signal<any> },
): { [s: string]: Signal<any> } {
  return { ...v1, ...v2 }
}

export function compileFiles(
  files: Signal<data.Files>,
  updateFile: (path: string, buffer: Buffer) => void,
  deleteFile: (path: string) => void,
  setSelected: (name: string) => void,
): { compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>, compiledNotes: Signal<data.CompiledNotes> } {

  const filesByName = groupFilesByName(files);

  const compiledFilesRef = Signal.ref<Immutable.Map<string, Signal<data.CompiledFile>>>();

  const compiledNotesRef = Signal.ref<data.CompiledNotes>();

  const compiledFiles = Signal.mapImmutableMap(files, file =>
    Signal.label(
      file.path,
      compileFile(file, compiledFilesRef, compiledNotesRef, updateFile, deleteFile, setSelected)
    )
  );
  compiledFilesRef.set(compiledFiles);

  const compiledNotes: Signal<data.CompiledNotes> = Signal.mapImmutableMap(filesByName, (files, name) => {
    function fileForType(type: data.Types): data.File | undefined {
      // TODO(jaked) fix names for index files, then just use name here instead of files
      return files.find(file => file.type === type);
    }

    function compiledFileForType(type: data.Types): Signal<data.CompiledFile | undefined> {
      // TODO(jaked) fix names for index files, then just use name here instead of files
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
        compiledFileForType('mdx'),
        compiledFileForType('table'),
        compiledFileForType('json'),
        compiledFileForType('jpeg'),
        compiledFileForType('meta'),
      ).map(([mdx, table, json, jpeg, meta]) => {
        let rendered: Signal<React.ReactNode> = Signal.ok(null);
        let exportType: Type.ModuleType = Type.module({ });
        let exportValue: { [s: string]: Signal<any> } = {};
        let publishedType: 'html' | 'jpeg' = 'html';

        if (meta) {
          rendered = meta.rendered;
          exportType = mergeModuleType(exportType, meta.exportType);
          exportValue = mergeModuleValue(exportValue, meta.exportValue);
        }
        if (table) {
          rendered = table.rendered;
          exportType = mergeModuleType(exportType, table.exportType);
          exportValue = mergeModuleValue(exportValue, table.exportValue);
        }
        if (json) {
          rendered = json.rendered;
          exportType = mergeModuleType(exportType, json.exportType);
          exportValue = mergeModuleValue(exportValue, json.exportValue);
        }
        if (jpeg) {
          publishedType = 'jpeg';
          rendered = jpeg.rendered;
          exportType = mergeModuleType(exportType, jpeg.exportType);
          exportValue = mergeModuleValue(exportValue, jpeg.exportValue);
        }
        if (mdx) {
          rendered = mdx.rendered;
          exportType = mergeModuleType(exportType, mdx.exportType);
          exportValue = mergeModuleValue(exportValue, mdx.exportValue);
        }

        const problems =
          (mdx ? mdx.problems : false) ||
          (table ? table.problems : false) ||
          (json ? json.problems : false) ||
          (jpeg ? jpeg.problems : false) ||
          (meta ? meta.problems : false);

        return {
          problems,
          rendered,
          publishedType,
          exportType,
          exportValue,
        };
      });
      return {
        name,
        publishedType: parts.map(parts => parts.publishedType),
        meta: metaForPath(Name.pathOfName(name, 'meta'), compiledFiles),
        files: {
          mdx: fileForType('mdx'),
          table: fileForType('table'),
          json: fileForType('json'),
          jpeg: fileForType('jpeg'),
          meta: fileForType('meta'),
        },
        problems: parts.map(parts => parts.problems),
        rendered: parts.flatMap(parts => parts.rendered),
        exportType: parts.map(parts => parts.exportType),
        exportValue: parts.map(parts => parts.exportValue),
      };
  });
  compiledNotesRef.set(compiledNotes);

  return { compiledFiles, compiledNotes };
}
