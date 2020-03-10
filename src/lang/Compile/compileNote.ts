import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import * as String from '../../util/String';
import Trace from '../../util/Trace';
import { bug } from '../../util/bug';
import Type from '../Type';
import Typecheck from '../Typecheck';
import * as Evaluate from '../Evaluate';
import * as data from '../../data';
import compileMeta from './compileMeta';
import compileJpeg from './compileJpeg';
import compileJson from './compileJson';
import compileMdx from './compileMdx';
import compileTable from './compileTable';

// TODO(jaked) recompile only changed note parts
export default function compileNote(
  trace: Trace,
  parsedNote: data.ParsedNoteWithImports,
  typeEnv: Typecheck.Env,
  valueEnv: Evaluate.Env,
  noteEnv: Signal<Immutable.Map<string, data.CompiledNote>>,
  updateFile: (path: string, buffer: Buffer) => void,
  setSelected: (tag: string) => void,
): data.CompiledNote {
  // TODO(jaked) Object.map or wrap object in helper
  let compiled = Object.keys(parsedNote.content).reduce<data.NoteCompiled>(
    (obj, key) => {
      switch (key) {
        case 'json': {
          const file = parsedNote.files.json ?? bug(`expected json file`);
          const ast = parsedNote.parsed.json ?? bug(`expected parsed json`);
          const json =
            Signal.join(file, ast, parsedNote.meta).map(([file, ast, meta]) =>
              compileJson(file, ast, meta, updateFile)
            );
          return { ...obj, json };
        }

        case 'jpeg': {
          const file = parsedNote.files.jpg ?? bug(`expected jpg file`);
          const jpeg = file.map(file => compileJpeg(parsedNote.tag));
          return { ...obj, jpeg };
        }

        case 'table': {
          const ast = parsedNote.parsed.table ?? bug(`expected parsed table`);
          const table =
            Signal.join(
              ast,
              noteEnv,
              parsedNote.imports
            ).flatMap(([ast, noteEnv, imports]) =>
              compileTable(
                trace,
                ast,
                parsedNote.tag,
                imports,
                noteEnv,
                setSelected
              ));
          return { ...obj, table };
        }

        case 'meta': {
          const ast = parsedNote.parsed.meta ?? bug(`expected parsed meta`);
          const meta = ast.map(ast => compileMeta(ast));
          return { ...obj, meta };
        }

        case 'mdx': return obj; // handled below

        default:
          throw new Error(`unhandled note type '${key}'`);
      }
    },
    {}
  );

  if (parsedNote.parsed.mdx) {
    const moduleTypeEnv =
      Signal.joinImmutableMap(noteEnv.map(noteEnv => noteEnv.map(note => note.exportType)));
    const moduleValueEnv =
      noteEnv.map(noteEnv => noteEnv.map(note => note.exportValue));
    const mdx =
      Signal.join(
        moduleTypeEnv,
        moduleValueEnv,
        compiled.json ?? Signal.ok(undefined),
        compiled.table ?? Signal.ok(undefined),
        parsedNote.parsed.mdx,
        parsedNote.meta
      ).map(([moduleTypeEnv, moduleValueEnv, json, table, mdx, meta]) => {
        if (json) {
          const dataType = json.exportType.get('mutable');
          const dataValue = json.exportValue['mutable'];
          if (dataType && dataValue) {
            typeEnv = typeEnv.set('data', dataType);
            valueEnv = valueEnv.set('data', dataValue);
          }
        }

        if (table) {
          const tableType = table.exportType.get('default');
          const tableValue = table.exportValue['default'];
          if (tableType && tableValue) {
            typeEnv = typeEnv.set('table', tableType);
            valueEnv = valueEnv.set('table', tableValue);
          }
        }

        return compileMdx(
          trace,
          mdx,
          String.capitalize(parsedNote.tag),
          meta,
          typeEnv,
          valueEnv,
          moduleTypeEnv,
          moduleValueEnv,
        );
      });
    compiled = { ...compiled, mdx };
  }

  // TODO(jaked) don't compute unneeded renderings
  let rendered: Signal<React.ReactNode>;
  if (compiled.mdx) rendered = compiled.mdx.flatMap(mdx => mdx.rendered);
  else if (compiled.table) rendered = compiled.table.flatMap(table => table.rendered);
  else if (compiled.json) rendered = compiled.json.flatMap(json => json.rendered);
  else if (compiled.jpeg) rendered = compiled.jpeg.flatMap(jpeg => jpeg.rendered);
  else rendered = Signal.ok(undefined); // for dummy dir notes

  const compileds = Object.values(compiled).map(compiled => {
    if (!compiled) bug(`undefined compiled`);
    return compiled;
  });
  const problems = Signal.join(
    ...compileds.map(compiled =>
      // TODO(jaked) should also check for failure
      compiled.map(compiled => compiled.problems)
    )
  ).map(problems => problems.some(problems => problems));

  const compileds2: Signal<data.Compiled>[] = [];
  if (compiled.mdx) compileds2.push(compiled.mdx);
  if (compiled.json) compileds2.push(compiled.json);
  if (compiled.table) compileds2.push(compiled.table);

  const exportType = Signal.join(...compileds).map(compileds => {
    const moduleTypeFields: Array<{ field: string, type: Type }> = [];
    compileds.forEach(compiled => moduleTypeFields.push(...compiled.exportType.fields));

    // TODO(jaked) make this easier somehow
    return Type.module(
      moduleTypeFields.reduce<{ [f: string]: Type }>(
        (obj, fieldType) => {
          const { field, type } = fieldType;
          return { ...obj, [field]: type };
        },
        {}
      )
    );
  });

  const exportValue = Signal.join(...compileds).map(compileds => {
    let moduleValue: { [s: string]: Signal<any> } = {};
    compileds.forEach(compiled => moduleValue = { ...moduleValue, ...compiled.exportValue });
    return moduleValue;
  });

  return { ...parsedNote, compiled, rendered, problems, exportType, exportValue };
}
