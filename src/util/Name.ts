import * as Path from 'path';
import { Types } from '../model';

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
  const normalized = Path.normalize('/' + name.trim());
  if (normalized.endsWith('/') && normalized.length > 1)
    return normalized.substr(0, normalized.length - 1);
  else
    return normalized;
}

export function resolve(dir: string, name: string) {
  return Path.resolve(dir, name);
}

export function rewrite(names: Map<string, unknown>, name: string) {
  name = normalize(name);
  if (names.has(name)) return name;
  const nameSlashIndex = name + '/index';
  if (names.has(nameSlashIndex)) return nameSlashIndex;
  return null;
}

export function rewriteResolve(names: Map<string, unknown>, current: string, name: string) {
  return rewrite(names, resolve(dirname(current), name));
}
