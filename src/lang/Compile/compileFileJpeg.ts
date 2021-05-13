import * as React from 'react';
import Signal from '../../util/Signal';
import Try from '../../util/Try';
import Type from '../Type';
import * as Render from '../Render';
import { Content, CompiledFile } from '../../model';

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
    const exportInterface = new Map([
      [ 'buffer', Try.ok({ type: Type.abstract('Buffer'), dynamic: false }) ],
      [ 'objectUrl', Try.ok({ type: Type.string, dynamic: false }) ],
      [ 'img', Try.ok({ type: imgType, dynamic: false }) ],
      [ 'default', Try.ok({ type: imgType, dynamic: false }) ],
    ]);
    const exportValue = new Map<string, unknown>([
      [ 'buffer', buffer ],
      [ 'objectUrl', objectUrl ],
      [ 'img', component ],
      [ 'default', component ],
    ]);

    const rendered =
      component({
        style: {
          maxWidth: '100%',
          objectFit: 'contain' // ???
        }
      });

    return {
      exportType: exportInterface,
      exportValue,
      rendered,
      problems: false,
      ast: Signal.ok(null)
    };
  });

  return {
    ast: Signal.ok(null),
    exportInterface: compiled.map(({ exportType }) => exportType),
    problems: compiled.liftToTry().map(compiled =>
      compiled.type === 'ok' ? compiled.ok.problems : true
    ),
    exportValue: compiled.map(({ exportValue }) => exportValue),
    rendered: compiled.map(({ rendered }) => rendered)
  };
}
