import * as Path from 'path';
import * as Immutable from 'immutable';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import * as Parse from '../Parse';
import Type from '../Type';
import * as data from '../../data';

import compileTable from './compileTable';

// TODO(jaked) method on File?
function tagOfPath(path: string) {
  const pathParts = Path.parse(path);
  if (pathParts.name === 'index') return pathParts.dir;
  else return Path.join(pathParts.dir, pathParts.name);
}

const unimplementedSignal = Signal.err(new Error('unimplemented'));

export default function compileFileTable(
  trace: Trace,
  file: data.File,
  compiledFiles: Signal<Immutable.Map<string, Signal<data.CompiledFile>>>,
  setSelected: (tag: string) => void,
): Signal<data.CompiledFile> {

  const noteTag = tagOfPath(file.path);

  const ast = file.content.map(Parse.parseExpression);

  // TODO(jaked) support non-index foo.table
  const importsNoteEnv: Signal<[
    Immutable.Set<string>,
    Immutable.Map<string, Signal<data.CompiledNote>>
  ]> = compiledFiles.map(compiledFiles => {
    const importsSet = Immutable.Set<string>().asMutable();
    const noteEnv = Immutable.Map<string, Signal<data.CompiledNote>>().asMutable();
    const dir = Path.parse(file.path).dir;
    compiledFiles.forEach((compiledFile, path) => {
      // TODO(jaked) not sure if we should handle nested dirs in tables
      // TODO(jaked) handle non-json files
      if (!Path.relative(dir, path).startsWith('..') && Path.extname(path) === '.json') {
        const tag = tagOfPath(path);
        importsSet.add(tag);

        // TODO(jaked)
        // since compileNotes expectes a CompiledNote environment
        // we need to fake one up for now.
        noteEnv.set(tag, compiledFile.map(compiledFile => ({
          tag,
          isIndex: false,
          meta: unimplementedSignal,
          files: { },
          parsed: { },
          imports: unimplementedSignal,
          compiled: { },
          problems: Signal.ok(compiledFile.problems),
          rendered: compiledFile.rendered,
          exportType: Signal.ok(compiledFile.exportType),
          exportValue: Signal.ok(compiledFile.exportValue),
        })));
      }
    });
    return [ importsSet.asImmutable(), noteEnv.asImmutable() ]
  });

  return ast.liftToTry().flatMap(astTry => {
    const astTryOrig = astTry;
    switch (astTry.type) {
      case 'ok':
        // TODO(jaked) maybe this can be simplified once we inline compileTable
        return importsNoteEnv.flatMap(importsNoteEnv => {
          const [ imports, noteEnv] = importsNoteEnv;
          return Signal.joinImmutableMap(Signal.ok(noteEnv)).flatMap(noteEnv =>
            compileTable(trace, astTry.ok, noteTag, imports, noteEnv, setSelected)
              .map(compiled => ({ ...compiled, ast: astTryOrig }))
          );
        });

      case 'err': {
        return Signal.ok({
          exportType: Type.module({}),
          exportValue: {},
          rendered: Signal.constant(astTry),
          problems: true,
          ast: astTryOrig
        })
      }
    }
  });
}
