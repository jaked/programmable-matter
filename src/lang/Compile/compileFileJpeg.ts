import * as React from 'react';
import Signal from '../../util/Signal';
import Type from '../Type';
import * as Render from '../Render';
import { Content, CompiledFile } from '../../data';

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

export default function compileFileJpeg(
  file: Content
): CompiledFile {
  const compiled = file.content.map(content => {
    const buffer = content as Buffer;
    // TODO(jaked) these URLs need to be freed
    // https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL
    const objectUrl = URL.createObjectURL(new Blob([buffer.buffer]));

    const component = ({ width, height, style }: { width?, height?, style? }) =>
      React.createElement(Render.context.Consumer, {
        children: context => {
          switch (context) {
            case 'screen':
              return React.createElement('img', { src: objectUrl, width, height, style });

            case 'server': {
              const src = `data:image/jpeg;base64,${buffer.toString('base64')}`;
              return React.createElement('img', { src, width, height, style });
            }
          }
        }
      })

    const imgType = componentType({
      width: Type.undefinedOrNumber,
      height: Type.undefinedOrNumber,
      style: styleType,
    });

    // TODO(jaked) parse JPEG file and return metadata
    const exportType = Type.module({
      buffer: Type.abstract('Buffer'),
      objectUrl: Type.string,
      img: imgType,
      default: imgType,
    });
    const exportValue = new Map<string, Signal<unknown>>([
      [ 'buffer', Signal.ok(buffer) ],
      [ 'objectUrl', Signal.ok(objectUrl) ],
      [ 'img', Signal.ok(component) ],
      [ 'default', Signal.ok(component) ],
    ])

    const rendered =
      component({
        style: {
          maxWidth: '100%',
          objectFit: 'contain' // ???
        }
      });

    return {
      exportType,
      exportValue,
      rendered,
      problems: false,
      ast: Signal.ok(null)
    };
  });

  return {
    ast: Signal.ok(null),
    exportType: compiled.map(({ exportType }) => exportType),
    problems: compiled.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: compiled.map(({ exportValue }) => exportValue),
    rendered: compiled.map(({ rendered }) => rendered)
  };
}
