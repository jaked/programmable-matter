import * as Path from 'path';
import { Types } from '../data';

// TODO(jaked)
// instead of stripping `index` here we should keep it part of the tag
// and deal with it in references (e.g. `foo/index`, `foo/`, and `foo` should all work).
// a problem with stripping is that it gives an empty tag to the root index

export function tagOfPath(path: string) {
  const pathParts = Path.parse(path);
  if (pathParts.name === 'index') return pathParts.dir
  else return Path.join(pathParts.dir, pathParts.name);
}

export function pathOfTag(tag: string, isIndex: boolean, type: Types) {
  if (isIndex) return Path.join(tag, `index.${type}`);
  else return `${tag}.${type}`;
}
