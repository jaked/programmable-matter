// TODO(jaked) this must exist already
// TODO(jaked) is there a way to get Scala-ish Try(() => ...) ?

export type Success<T> = { type: 'success', success: T };
export type Failure = { type: 'failure', failure: any };
export type Try<T> = Success<T> | Failure;

export function success<T>(t: T): Success<T> {
  return { type: 'success', success: t };
}

export function failure(e: any): Failure {
  return { type: 'failure', failure: e };
}

export function apply<T>(f: () => T) {
  try {
    return success(f());
  } catch (e) {
    return failure(e);
  }
}

export function forEach<T>(
  t: Try<T>,
  f: (t: T) => void
) {
  if (t.type === 'success')
    f(t.success);
}

export function map<T, U>(
  t: Try<T>,
  f: (t: T) => U
): Try<U> {
  if (t.type === 'failure') return t;
  else return apply(() => f(t.success));
}

export function joinMap<T, U, R>(
  t: Try<T>,
  u: Try<U>,
  f: (t: T, u: U) => R
): Try<R> {
  if (t.type === 'failure') return t;
  else if (u.type === 'failure') return u;
  else return apply(() => f(t.success, u.success));
}
