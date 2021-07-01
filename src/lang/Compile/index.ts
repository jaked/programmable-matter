import React from 'react';

import { bug } from '../../util/bug';
import Signal from '../../util/Signal';
import * as Name from '../../util/Name';
import * as model from '../../model';

import compileFile from './compileFile';
import groupFilesByName from '../../util/groupFilesByName';
import metaForPath from './metaForPath';

function mergeModule<T>(
  v1: Signal<Map<string, T>>,
  v2: Signal<Map<string, T>>,
): Signal<Map<string, T>> {
  return Signal.join(v1, v2).map(([v1, v2]) => new Map([...v1.entries(), ...v2.entries()]));
}

export function compileFiles(
  files: Signal<model.WritableContents>,
  updateFile: (path: string, buffer: Buffer) => void = (path: string, buffer: Buffer) => { },
  deleteFile: (path: string) => void = (path: string) => { },
  setSelected: (name: string) => void = (name: string) => { },
): { compiledFiles: Signal<Map<string, model.CompiledFile>>, compiledNotes: Signal<model.CompiledNotes> } {

  const filesByName = groupFilesByName(files);

  const compiledFilesRef = Signal.ref<Map<string, model.CompiledFile>>();

  const compiledNotesRef = Signal.ref<model.CompiledNotes>();

  const compiledFiles = Signal.mapMap(files, file =>
    compileFile(file, compiledFilesRef, compiledNotesRef, updateFile, deleteFile, setSelected)
  );
  compiledFilesRef.set(compiledFiles);

  const compiledNotes: Signal<model.CompiledNotes> = Signal.mapMap(filesByName, (files, name) => {
    function fileForType(type: model.Types): model.Content | undefined {
      return files.get(Name.pathOfName(name, type));
    }

    function compiledFileForType(type: model.Types): Signal<model.CompiledFile> | undefined {
      const file = fileForType(type);
      if (file) {
        return compiledFiles.map(compiledFiles =>
          compiledFiles.get(file.path) ?? bug(`expected compiled file`)
        );
      }
    }

    const pmCompiled = compiledFileForType('pm');
    const tableCompiled = compiledFileForType('table');
    const jsonCompiled = compiledFileForType('json');
    const jpegCompiled = compiledFileForType('jpeg');
    const pngCompiled = compiledFileForType('png');
    const metaCompiled = compiledFileForType('meta');
    const xmlCompiled = compiledFileForType('xml');
    let type: model.Types | undefined = undefined;
    if (metaCompiled) type = 'meta';
    if (tableCompiled) type = 'table';
    if (jsonCompiled) type = 'json';
    if (jpegCompiled) type = 'jpeg';
    if (pngCompiled) type = 'png';

    if (pmCompiled) type = 'pm';
    if (xmlCompiled) type = 'xml';
    if (!type) bug(`expected type`);

    // TODO(jaked) Signal.untuple
    const parts =
      Signal.join(
        pmCompiled ?? Signal.ok(undefined),
        tableCompiled ?? Signal.ok(undefined),
        jsonCompiled ?? Signal.ok(undefined),
        jpegCompiled ?? Signal.ok(undefined),
        pngCompiled ?? Signal.ok(undefined),
        metaCompiled ?? Signal.ok(undefined),
        xmlCompiled ?? Signal.ok(undefined),
      ).map(([pm, table, json, jpeg, png, meta, xml]) => {
        let rendered: Signal<React.ReactNode> = Signal.ok(null);
        let exportInterface: Signal<Map<string, model.Interface>> = Signal.ok(new Map());
        let exportValue: Signal<Map<string, unknown>> = Signal.ok(new Map());
        let html: Signal<string> | undefined;
        let js: Signal<string> | undefined;

        if (meta) {
          rendered = meta.rendered;
          exportInterface = mergeModule(exportInterface, meta.exportInterface);
          exportValue = mergeModule(exportValue, meta.exportValue);
        }
        if (table) {
          rendered = table.rendered;
          exportInterface = mergeModule(exportInterface, table.exportInterface);
          exportValue = mergeModule(exportValue, table.exportValue);
        }
        if (json) {
          rendered = json.rendered;
          exportInterface = mergeModule(exportInterface, json.exportInterface);
          exportValue = mergeModule(exportValue, json.exportValue);
        }
        if (jpeg) {
          rendered = jpeg.rendered;
          exportInterface = mergeModule(exportInterface, jpeg.exportInterface);
          exportValue = mergeModule(exportValue, jpeg.exportValue);
        }
        if (png) {
          rendered = png.rendered;
          exportInterface = mergeModule(exportInterface, png.exportInterface);
          exportValue = mergeModule(exportValue, png.exportValue);
        }
        if (pm) {
          rendered = pm.rendered;
          exportInterface = mergeModule(exportInterface, pm.exportInterface);
          exportValue = mergeModule(exportValue, pm.exportValue);
          html = pm.html;
          js = pm.js;
        }
        if (xml) {
          rendered = xml.rendered;
          exportInterface = mergeModule(exportInterface, xml.exportInterface);
          exportValue = mergeModule(exportValue, xml.exportValue);
        }

        // TODO(jaked) ugh optional Signal-valued fields are a pain
        const problems = Signal.join(
          (pm ? pm.problems : Signal.ok(false)),
          (table ? table.problems : Signal.ok(false)),
          (json ? json.problems : Signal.ok(false)),
          (jpeg ? jpeg.problems : Signal.ok(false)),
          (png ? png.problems : Signal.ok(false)),
          (meta ? meta.problems : Signal.ok(false)),
          (xml ? xml.problems : Signal.ok(false)),
        ).map(([pm, table, json, jpeg, png, meta, xml]) =>
          pm || table || json || jpeg || png || meta || xml
        );

        return {
          problems,
          rendered,
          exportInterface,
          exportValue,
          html,
          js,
        };
      });
      let meta: Signal<model.Meta>;
      if (type === 'pm') {
        const pmContent = fileForType('pm') ?? bug(`expected pm`);
        meta = pmContent.content.map(content => {
          const pmContent = content as model.PMContent;
          return pmContent.meta;
        })

      // TODO(jaked) temporary hack
      } else if (type === 'xml') {
        meta = Signal.ok({ publish: true });

      } else {
        meta = metaForPath(Name.pathOfName(name, 'meta'), compiledFiles);
      }
      return {
        name,
        type,
        meta,
        files: {
          pm: fileForType('pm'),
          table: fileForType('table'),
          json: fileForType('json'),
          jpeg: fileForType('jpeg'),
          png: fileForType('png'),
          meta: fileForType('meta'),
          xml: fileForType('xml'),
        },
        problems: parts.flatMap(parts => parts.problems),
        rendered: parts.flatMap(parts => parts.rendered),
        exportInterface: parts.flatMap(parts => parts.exportInterface),
        exportValue: parts.flatMap(parts => parts.exportValue),
        html: type === 'pm' ? parts.flatMap(parts => parts.html ?? bug()) : undefined,
        js: type === 'pm' ? parts.flatMap(parts => parts.js ?? bug()) : undefined,
      };
  });
  compiledNotesRef.set(compiledNotes);

  return { compiledFiles, compiledNotes };
}
