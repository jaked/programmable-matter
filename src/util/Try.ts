// TODO(jaked) this must exist already
// TODO(jaked) is there a way to get Scala-ish Try(() => ...) ?

class Ok<T> {
  type = 'ok' as const;

  ok: T;
  constructor(ok: T) { this.ok = ok; }

  get() { return this.ok; }
  map<U>(f: (t: T) => U) { return apply(() => f(this.ok)); }
  flatMap<U>(f: (t: T) => Try<U>) {
    const tt = apply(() => f(this.ok));
    if (tt.type === 'ok') return tt.ok;
    else return <Try<U>><unknown>tt;
  }
  forEach(f: (t: T) => void) { return f(this.ok); }
}

class Err {
  type = 'err' as const;

  err: Error;
  constructor(err: Error) { this.err = err; }

  get(): never { throw this.err; }
  map<U>(f: (t: never) => U): Try<never> { return this; }
  flatMap<U>(f: (t: never) => Try<U>): Try<never> { return this; }
  forEach(f: (t: never) => void) { }
}

export type Try<T> = {
  get: () => T;
  map<U>(f: (t: T) => U): Try<U>;
  flatMap<U>(f: (t: T) => Try<U>): Try<U>;
  forEach(f: (t: T) => void): void;
} & ({ type: 'ok'; ok: T; } | { type: 'err'; err: Error; })

export function ok<T>(ok: T): Try<T> { return new Ok(ok); }
export function err(err: Error): Try<never> { return new Err(err); }

export function apply<T>(f: () => T) {
  try { return ok(f()); }
  catch (e) { return err(e); }
}

export function joinMap2<T1, T2, R>(
  try1: Try<T1>,
  try2: Try<T2>,
  f: (t1: T1, t2: T2) => R
): Try<R> {
  if (try1.type === 'err') return <Try<R>><unknown>try1;
  if (try2.type === 'err') return <Try<R>><unknown>try2;
  return apply(() => f(try1.ok, try2.ok));
}

// TODO(jaked)
// is there a way to export both type and module together,
// so callers can just `import Try from './Try'` ?
