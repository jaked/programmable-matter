import { Tuple2 } from '../../util/Tuple';
import { bug } from '../../util/bug';
import * as Types from './types';
import * as Type from './constructors';
import * as Predef from './predef';

export default function (type: Types.Type) {
  switch (type.kind) {
    case 'Abstract':
      switch (type.label) {
        case 'React.ReactNode': {
          if (type.params.size !== 0) bug(`expected 0 params to React.ReactNode`)
          return Predef.reactNodeType;
        }

        case 'React.Component': {
          if (type.params.size !== 1) bug(`expected 1 param to React.Component`)
          const param = type.params.get(0) ?? bug();
          if (param.kind !== 'Object') bug(`expected object param to React.Component, got ${param.kind}`);
          return Type.functionType([ param ], Predef.reactElementType);
        }

        // TODO(jaked)
        // this seems to be somewhat deprecated, see
        // https://github.com/typescript-cheatsheets/react-typescript-cheatsheet#function-components
        // but it is useful to avoid a separate `type Props = ...`
        case 'React.FC':
        case 'React.FunctionComponent': {
          if (type.params.size !== 1) bug(`expected 1 param to React.FunctionComponent`)
          const param = type.params.get(0) ?? bug();
          if (param.kind !== 'Object') bug(`expected object param to React.FunctionComponent, got ${param.kind}`);
          // TODO(jaked) catch multiple definition of `children`
          const paramWithChildren = Type.object(param.fields.push(Tuple2('children', Type.array(Predef.reactNodeType))));
          return Type.functionType([ paramWithChildren ], Predef.reactNodeType);
        }

        default:
          return type;
      }

    default:
      return type;
  }
}