import * as Path from 'path';
import { Types } from '../data';

export function nameOfPath(path: string) {
  const pathParts = Path.parse(path);
  return Path.join(pathParts.dir, pathParts.name);
}

export function pathOfName(name: string, type: Types) {
  return `${name}.${type}`;
}

export function basename(name: string) {
  return Path.basename(name);
}

export function dirname(name: string) {
  return Path.dirname(name);
}

export function join(dir: string, basename: string) {
  return Path.join(dir, basename);
}

export function relative(dir: string, name: string) {
  return Path.relative(dir, name);
}

export function normalize(name: string) {
  return Path.normalize('/' + name.trim());
}

export function resolve(dir: string, name: string) {
  return Path.resolve(dir, name);
}
