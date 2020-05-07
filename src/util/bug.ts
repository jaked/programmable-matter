export function bug(msg?: string): never {
  if (msg === undefined) msg = 'bug';
  throw new Error(msg);
}
