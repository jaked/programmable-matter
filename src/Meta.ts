import { Meta } from './data';
import * as Parse from './lang/Parse';

export function validate(obj: any): Meta {
  let dataType = {}
  if (typeof obj.dataType === 'string') {
    dataType = { dataType: Parse.parseType(obj.dataType) }
  }

  const dirMeta =
    typeof obj.dirMeta === 'object' ?
    { dirMeta: validate(obj.dirMeta) } : {};

  return { ...obj, ...dataType, ...dirMeta };
}
