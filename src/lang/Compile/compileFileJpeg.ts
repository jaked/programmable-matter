import * as React from 'react';
import Signal from '../../util/Signal';
import Trace from '../../util/Trace';
import Try from '../../util/Try';
import Type from '../Type';
import * as data from '../../data';

// TODO(jaked) merge componentType / styleType with ones in Render/initTypeEnv

// TODO(jaked) move to Typecheck?
function componentType(props: { [f: string]: Type }): Type {
  return Type.abstract('React.Component', Type.object(props));
}

// TODO(jaked) need a way to translate TypeScript types
const styleType = Type.undefinedOr(Type.object({
  backgroundColor: Type.undefinedOrString,
  float: Type.undefinedOr(Type.enumerate('left', 'right', 'inherit', 'none')),
  fontSize: Type.undefinedOrString,
  height: Type.undefinedOrString,
  margin: Type.undefinedOrString,
  marginBottom: Type.undefinedOrString,
  marginLeft: Type.undefinedOrString,
  marginRight: Type.undefinedOrString,
  marginTop: Type.undefinedOrString,
  maxWidth: Type.undefinedOrString,
  objectFit: Type.undefinedOr(Type.enumerate('contain')),
  padding: Type.undefinedOrString,
}));

function compileJpeg(
  buffer: Buffer,
): data.Compiled {
  // TODO(jaked) these URLs need to be freed
  // https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL
  const objectUrl = URL.createObjectURL(new Blob([buffer.buffer]));

  const component = ({ width, height, style }: { width?, height?, style? }) =>
    React.createElement('img', { src: objectUrl, width, height, style })

  // TODO(jaked) parse JPEG file and return metadata
  const exportType = Type.module({
    objectUrl: Type.string,
    default: componentType({
      width: Type.undefinedOrNumber,
      height: Type.undefinedOrNumber,
      style: styleType,
    }),
  });
  const exportValue = {
    objectUrl: Signal.ok(objectUrl),
    default: Signal.ok(component),
  };

  const rendered =
    Signal.ok(component({
      style: {
        maxWidth: '100%',
        objectFit: 'contain' // ???
      }
    }));
  return { exportType, exportValue, rendered, problems: false };
}

export default function compileFileJpeg(
  trace: Trace,
  file: data.File
): Signal<data.CompiledFile> {
  return file.bufferCell.map(buffer => compileJpeg(buffer))
    .map(compiled => ({ ...compiled, ast: Try.ok(null) }));
}
