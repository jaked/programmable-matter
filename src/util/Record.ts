// immutable record base class, based on https://github.com/alexeyraspopov/dataclass
// fixed bugs and adapted to work with Typescript + Immutable

// MIT License

// Copyright (c) 2017-present Alexey Raspopov

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

import * as Immutable from 'immutable';

let guard = Symbol('EmptyRecord');
let values = Symbol('CustomValues');
let defaults = Symbol('DefaultValues');
let empty = () => void 0;

export default class Record<T> {
  constructor(custom: Partial<T> = {}) {
    if (custom as any === guard) return this;

    if (!this.constructor.hasOwnProperty(defaults)) {
      // call constructor with sentinel value to learn the defaults
      let emptyRecord = new (this as any).constructor(guard);
      Object.defineProperty(this.constructor, defaults, {
        value: emptyRecord,
      });
    }

    let base = this.constructor[defaults];

    for (let key in base) {
      if (!base.hasOwnProperty(key)) continue;

      let getter = key in custom ? () => custom[key] : () => base[key];

      Object.defineProperty(this, key, {
        enumerable: true,
        get: getter,
        set: empty,
      });
    }

    Object.defineProperty(this, values, {
      value: custom,
    });
  }

  copy(patch: Partial<T>): T {
    let custom = Object.assign({}, this[values], patch);
    let prototype = Object.getPrototypeOf(this);
    return new prototype.constructor(custom);
  }

  equals(other: any): boolean {
    if (this.constructor !== other.constructor)
      return false;

    let a = this[values];
    let b = other[values];

    for (let key in this.constructor[defaults]) {
      let valueA;
      let valueB;
      if (key in a) {
        valueA = a[key];
        valueB = (key in b) ? b[key] : other.constructor[defaults][key];
      } else if (key in b) {
        valueA = this.constructor[defaults][key];
        valueB = b[key];
      } else {
        // both are default so we need not compare actual values
        valueA = undefined;
        valueB = undefined;
      }
      if (valueA && typeof valueA.equals === 'function') {
        if (!valueA.equals(valueB)) return false;
      } else if (valueA && typeof valueA.valueOf === 'function' && valueB && typeof valueB.valueOf === 'function') {
        if (valueA.valueOf() !== valueB.valueOf()) return false;
      } else if (valueA !== valueB) return false;
    }

    return true;
  }

  hashCode(): number {
    const vs = this[values];
    const kvs = Object.keys(this.constructor[defaults]).map(key => vs[key]);
    return Immutable.Seq(kvs).hashCode();
  }

  toObject(): Object {
    let result = {};

    for (let key in this.constructor[defaults]) {
      let value = this[key];
      result[key] = (value && typeof value.toObject === 'function') ? value.toObject() : value
    }

    return result;
  }
}
