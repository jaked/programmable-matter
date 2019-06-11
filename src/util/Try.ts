// TODO(jaked) this must exist already
// TODO(jaked) is there a way to get Scala-ish Try(() => ...) ?

class Ok<T> {
  type: 'ok' = 'ok';

  ok: T;
  constructor(ok: T) { this.ok = ok; }

  get() { return this.ok; }
  map<U>(f: (t: T) => U) { return apply(() => f(this.ok)); }
  forEach(f: (t: T) => void) { return f(this.ok); }
}

class Err {
  type: 'err' = 'err';

  err: Error;
  constructor(err: Error) { this.err = err; }

  get(): never { throw err; }
  map<U>(f: (t: never) => U): Try<never> { return this; }
  forEach(f: (t: never) => void) { }
}

export type Try<T> = Ok<T> | Err

export function ok<T>(ok: T): Try<T> { return new Ok(ok); }
export function err(err: Error): Try<never> { return new Err(err); }

export function apply<T>(f: () => T) {
  try { return ok(f()); }
  catch (e) { return err(e); }
}

// TODO(jaked)
// is there a way to export both type and module together,
// so callers can just `import Try from './Try'` ?
