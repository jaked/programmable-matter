export default class Trace {
  scope: any = { __start: process.hrtime.bigint() };
  stack: Array<any> = [];

  reset() {
    this.scope = { __start: process.hrtime.bigint() };
    this.stack = [];
  }

  open(label: string) {
    if (label === '__start' || label === '__end' || label === '__elapsed')
      throw new Error(`reserved label ${label}`);
    const newScope = { __start: process.hrtime.bigint() };
    this.scope[label] = newScope;
    this.stack.push(this.scope);
    this.scope = newScope;
  }

  close() {
    if (this.stack.length === 0)
      throw new Error('scope not open');
    const end = process.hrtime.bigint();
    this.scope.__elapsed = Number(end - this.scope.__start) / 1000000;
    delete this.scope.__start;
    this.scope = this.stack.pop();
  }

  time<T>(label: string, fn: () => T): T {
    this.open(label);
    try {
      const t = fn();
      this.close();
      return t;
    } catch (e) {
      this.close();
      throw e;
    }
  }

  finish() {
    if (this.stack.length !== 0)
      throw new Error('scope not closed');
    const end = process.hrtime.bigint();
    this.scope.__elapsed = Number(end - this.scope.__start) / 1000000;
    delete this.scope.__start;
    return this.scope;
  }
}
