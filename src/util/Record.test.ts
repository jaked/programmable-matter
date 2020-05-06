// immutable record base class, based on https://github.com/alexeyraspopov/dataclass
// adapted to work with Typescript + Immutable

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
import Record from './Record';

describe('Record', () => {
  class Entity extends Record<Entity> {
    someString: string = 'default string';
    someNum: number = 0.134;
    someBool: boolean = true;
    someOptional?: number = undefined;

    get exclamation() {
      return this.someString + '!';
    }
  }

  it('should create an entity with default values', () => {
    let entity = new Entity();

    expect(entity.toObject()).toEqual({
      someString: 'default string',
      someNum: 0.134,
      someBool: true,
      someOptional: undefined,
    });
  });

  it('should override defaults with custom values', () => {
    let entity = new Entity({ someOptional: 1, someString: 'hello' });

    expect(entity.toObject()).toEqual({
      someString: 'hello',
      someNum: 0.134,
      someBool: true,
      someOptional: 1,
    });
  });

  it('should satisfy composition law', () => {
    let entity = new Entity();
    let left = entity.copy({ someNum: 13, someBool: false });
    let right = entity.copy({ someNum: 13 }).copy({ someBool: false });

    expect(left.toObject()).toEqual(right.toObject());
  });

  // TODO(jaked) doesn't work in Typescript because the type parameter to Record is still Entity
  /*
  it('should support subclassing', () => {
    class SubEntity extends Entity {
      someNewThing: string = 'default';
    }

    let entityA = new SubEntity();
    let entityB = new SubEntity({ someString: 'test', someNewThing: 'blah' });

    expect(entityA.toObject()).toEqual({
      someString: 'default string',
      someNum: 0.134,
      someBool: true,
      someNullable: null,
      someNewThing: 'default',
    });

    expect(entityB.toObject()).toEqual({
      someString: 'test',
      someNum: 0.134,
      someBool: true,
      someNullable: null,
      someNewThing: 'blah',
    });
  });
  */

  it('should support polymorphism', () => {
    class Base extends Record<Base> {
      format: string = 'AAA';

      transform(value) {
        return this.format.replace(/A/g, value);
      }
    }

    class Child extends Base {
      transform(value) {
        return '-' + this.format.replace(/A/g, value);
      }
    }

    let baseEntity = new Base({ format: 'AAAAA' });
    let childEntity = new Child();

    expect(baseEntity.transform(1)).toBe('11111');
    expect(childEntity.transform(1)).toBe('-111');
  });

  it('should create new entity based on existent', () => {
    let entity = new Entity({ someBool: false });
    let updated = entity.copy({ someNum: 14 });

    expect(entity.toObject()).toEqual({
      someString: 'default string',
      someNum: 0.134,
      someBool: false,
      someOptional: undefined,
    });

    expect(updated.toObject()).toEqual({
      someString: 'default string',
      someNum: 14,
      someBool: false,
      someOptional: undefined,
    });
  });

  it('should compare custom values for two entities of the same type', () => {
    let entity = new Entity({ someBool: false });
    let equal = new Entity({ someBool: false });
    let updated = entity.copy({ someNum: 14 });

    expect(entity.equals(updated)).toBe(false);
    expect(entity.equals(equal)).toBe(true);
  });

  class Embedded extends Record<Embedded> {
    name: string = 'name';
    age: number = 1;
    entity: Entity = new Entity();
    date: Date = new Date();
    obj: Object = {foo: 'bar'};
  }

  it('should be serializable with embedded dataclass', () => {
    let dummyDate = new Date('1996-12-17T03:24:00');
    let embedded = new Embedded({
      date: dummyDate
    });
    let raw = {
      name: "name",
      age: 1,
      entity: {
        someString: "default string",
        someNum: 0.134,
        someBool: true,
        someOptional: undefined
      },
      date: dummyDate.toISOString(),
      obj: {
        foo: "bar"
      }
    };
    expect(JSON.stringify(embedded)).toBe(JSON.stringify(raw));
  })

  it('should compare dataclass with nested value objects', () => {
    let embeddedA = new Embedded({
      date: new Date('1996-12-17T03:24:00'),
      entity: new Entity({ someBool: false })
    });
    let embeddedB = new Embedded({
      date: new Date('1996-12-17T03:24:00'),
      entity: new Entity({ someBool: false })
    });
    let embeddedC = new Embedded({
      date: new Date('1996-12-17T03:24:00'),
      entity: new Entity({ someBool: true })
    });
    let embeddedD = new Embedded({
      date: new Date('2001-12-17T03:24:00'),
      entity: new Entity({ someBool: true })
    });
    expect(embeddedA.equals(embeddedB)).toBe(true);
    expect(embeddedB.equals(embeddedC)).toBe(false);
    expect(embeddedC.equals(embeddedD)).toBe(false);
  });

  it('should satisfy symmetry law', () => {
    let a = new Entity({ someString: '1' });
    let b = new Entity({ someString: '1' });
    let c = new Entity({ someString: '2' });

    expect(a.equals(b)).toBeTruthy();
    expect(b.equals(a)).toBeTruthy();
    expect(a.equals(c)).toBeFalsy();
    expect(c.equals(a)).toBeFalsy();
  });

  it('should satisfy transitivity law', () => {
    let a = new Entity({ someString: 'hello' });
    let b = new Entity({ someString: 'hello' });
    let c = new Entity({ someString: 'hello' });

    expect(a.equals(b)).toBeTruthy();
    expect(b.equals(c)).toBeTruthy();
    expect(a.equals(c)).toBeTruthy();
  });

  it('should be serializable', () => {
    let entity = new Entity({ someBool: false });
    let raw = {
      someString: 'default string',
      someNum: 0.134,
      someBool: false,
      someOptional: undefined,
    };

    expect(JSON.stringify(entity)).toBe(JSON.stringify(raw));
  });

  it('should support iterables', () => {
    let entity = new Entity({ someBool: false });

    expect(Object.entries(entity)).toEqual([
      ['someString', 'default string'],
      ['someNum', 0.134],
      ['someBool', false],
      ['someOptional', undefined],
    ]);

    expect(Object.keys(entity)).toEqual([
      'someString',
      'someNum',
      'someBool',
      'someOptional',
    ]);

    expect(Object.values(entity)).toEqual([
      'default string',
      0.134,
      false,
      undefined,
    ]);
  });

  it('should not allow assignment', () => {
    let entity = new Entity({ someBool: false });

    // TODO(jaked) should probably throw instead of silently failing
    entity.someBool = true;

    expect(entity.someBool).toBe(false);
  });

  it('should support predefined getters', () => {
    let entity = new Entity({ someString: 'abcde' });

    expect(entity.exclamation).toBe('abcde!');
  });

  it('supports hashCode', () => {
    const ent = new Entity();
    expect(ent.hashCode()).toBe(644220140);
  });

  it('hashCode does not depend on arg order', () => {
    const ent1 = new Entity({ someString: 'foo', someNum: 7 });
    const ent2 = new Entity({ someNum: 7, someString: 'foo' });
    expect(ent1.hashCode() === ent2.hashCode()).toBe(true);
  });

  it('is an Immutable value object', () => {
    expect(Immutable.isValueObject(new Entity())).toBe(true);
  });
});
