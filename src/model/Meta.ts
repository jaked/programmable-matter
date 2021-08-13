import { Meta } from '.';
import * as Parse from '../parse';

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
