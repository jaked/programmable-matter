export interface Cell<T> {
  get(): T;
  set(t: T): void;
}
