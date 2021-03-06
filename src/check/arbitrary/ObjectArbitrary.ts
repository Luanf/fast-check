import { Arbitrary } from './definition/Arbitrary';

import { array } from './ArrayArbitrary';
import { boolean } from './BooleanArbitrary';
import { constant } from './ConstantArbitrary';
import { dictionary } from './DictionaryArbitrary';
import { double } from './FloatingPointArbitrary';
import { integer } from './IntegerArbitrary';
import { oneof } from './OneOfArbitrary';
import { set } from './SetArbitrary';
import { string, unicodeString } from './StringArbitrary';
import { tuple } from './TupleArbitrary';

export class ObjectConstraints {
  constructor(
    readonly key: Arbitrary<string>,
    readonly values: Arbitrary<any>[],
    readonly maxDepth: number,
    readonly withSet: boolean,
    readonly withMap: boolean
  ) {}
  next(): ObjectConstraints {
    return new ObjectConstraints(this.key, this.values, this.maxDepth - 1, this.withSet, this.withMap);
  }

  /**
   * Default value of ObjectConstraints.Settings.values field
   */
  static defaultValues(): Arbitrary<any>[] {
    return [
      boolean(),
      integer(),
      double(),
      string(),
      oneof(string(), constant(null), constant(undefined)),
      oneof(
        double(),
        constant(-0),
        constant(0),
        constant(Number.NaN),
        constant(Number.POSITIVE_INFINITY),
        constant(Number.NEGATIVE_INFINITY),
        constant(Number.EPSILON),
        constant(Number.MIN_VALUE),
        constant(Number.MAX_VALUE),
        constant(Number.MIN_SAFE_INTEGER),
        constant(Number.MAX_SAFE_INTEGER)
      )
    ];
  }

  /** @hidden */
  private static boxArbitraries(arbs: Arbitrary<any>[]): Arbitrary<any>[] {
    return arbs.map(arb =>
      arb.map(v => {
        switch (typeof v) {
          case 'boolean':
            // tslint:disable-next-line:no-construct
            return new Boolean(v);
          case 'number':
            // tslint:disable-next-line:no-construct
            return new Number(v);
          case 'string':
            // tslint:disable-next-line:no-construct
            return new String(v);
          default:
            return v;
        }
      })
    );
  }

  /** @hidden */
  private static boxArbitrariesIfNeeded(arbs: Arbitrary<any>[], boxEnabled: boolean): Arbitrary<any>[] {
    return boxEnabled ? this.boxArbitraries(arbs).concat(arbs) : arbs;
  }

  static from(settings?: ObjectConstraints.Settings): ObjectConstraints {
    function getOr<T>(access: () => T | undefined, value: T): T {
      return settings != null && access() != null ? access()! : value;
    }
    return new ObjectConstraints(
      getOr(() => settings!.key, string()),
      this.boxArbitrariesIfNeeded(
        getOr(() => settings!.values, ObjectConstraints.defaultValues()),
        getOr(() => settings!.withBoxedValues, false)
      ),
      getOr(() => settings!.maxDepth, 2),
      getOr(() => settings!.withSet, false),
      getOr(() => settings!.withMap, false)
    );
  }
}

export namespace ObjectConstraints {
  /** Constraints to be applied during object generation */
  export interface Settings {
    /** Maximal depth allowed */
    maxDepth?: number;
    /**
     * Arbitrary for keys
     *
     * Default for `key` is: `fc.string()`
     */
    key?: Arbitrary<string>;
    /**
     * Arbitrary for values
     *
     * Default for `values` are:
     * - `fc.boolean()`,
     * - `fc.integer()`,
     * - `fc.double()`,
     * - `fc.string()`
     * - constants among:
     *  - `null`,
     *  - `undefined`,
     *  - `Number.NaN`,
     *  - `+0`,
     *  - `-0`,
     *  - `Number.EPSILON`,
     *  - `Number.MIN_VALUE`,
     *  - `Number.MAX_VALUE`,
     *  - `Number.MIN_SAFE_INTEGER`,
     *  - `Number.MAX_SAFE_INTEGER`,
     *  - `Number.POSITIVE_INFINITY`,
     *  - `Number.NEGATIVE_INFINITY`
     */
    values?: Arbitrary<any>[];
    /** Also generate boxed versions of values */
    withBoxedValues?: boolean;
    /** Also generate Set */
    withSet?: boolean;
    /** Also generate Map */
    withMap?: boolean;
  }
}

/** @hidden */
const arrayOfAnything = (
  arbKeys: Arbitrary<string>,
  arbitrariesForBase: Arbitrary<any>[],
  arbAny: Arbitrary<any>
): Arbitrary<any[]> => {
  return oneof(
    oneof(...arbitrariesForBase.map(arb => array(arb))), // base[]
    array(arbAny) // anything[]
  );
};

/** @hidden */
const setOfAnything = (
  arbKeys: Arbitrary<string>,
  arbitrariesForBase: Arbitrary<any>[],
  arbAny: Arbitrary<any>
): Arbitrary<Set<any>> => {
  return oneof(
    oneof(...arbitrariesForBase.map(arb => set(arb).map(v => new Set(v)))), // Set<base>
    set(arbAny).map(v => new Set(v)) // Set<anything>
  );
};

/** @hidden */
const objectOfAnything = (
  arbKeys: Arbitrary<string>,
  arbitrariesForBase: Arbitrary<any>[],
  arbAny: Arbitrary<any>
): Arbitrary<{ [key: string]: any }> => {
  return oneof(
    oneof(...arbitrariesForBase.map(arb => dictionary(arbKeys, arb))), // {[key]: base}
    dictionary(arbKeys, arbAny)
  );
};

/** @hidden */
const mapOfAnything = (
  arbKeys: Arbitrary<string>,
  arbitrariesForBase: Arbitrary<any>[],
  arbAny: Arbitrary<any>
): Arbitrary<Map<any, any>> => {
  const mapOf = (keyArb: Arbitrary<any>, valueArb: Arbitrary<any>) =>
    set(tuple(keyArb, valueArb), (t1, t2) => t1[0] === t2[0]).map(v => new Map(v));
  return oneof(
    oneof(...arbitrariesForBase.map(arb => mapOf(arbKeys, arb))), // Map<key, base>
    oneof(
      mapOf(arbKeys, arbAny), // Map<key, anything>
      mapOf(arbAny, arbAny) // Map<anything, anything>
    )
  );
};

/** @hidden */
const anythingInternal = (constraints: ObjectConstraints): Arbitrary<any> => {
  const arbKeys = constraints.key;
  const arbitrariesForBase = constraints.values;

  const eligibleArbitraries: Arbitrary<any>[] = [];
  eligibleArbitraries.push(oneof(...arbitrariesForBase)); // base
  if (constraints.maxDepth > 0) {
    const subArbAny = anythingInternal(constraints.next());
    eligibleArbitraries.push(arrayOfAnything(arbKeys, arbitrariesForBase, subArbAny));
    eligibleArbitraries.push(objectOfAnything(arbKeys, arbitrariesForBase, subArbAny));
    if (constraints.withMap) {
      eligibleArbitraries.push(mapOfAnything(arbKeys, arbitrariesForBase, subArbAny));
    }
    if (constraints.withSet) {
      eligibleArbitraries.push(setOfAnything(arbKeys, arbitrariesForBase, subArbAny));
    }
  }
  return oneof(...eligibleArbitraries);
};

/** @hidden */
const objectInternal = (constraints: ObjectConstraints): Arbitrary<any> => {
  return dictionary(constraints.key, anythingInternal(constraints));
};

/**
 * For any type of values
 *
 * You may use {@link sample} to preview the values that will be generated
 *
 * @example
 * ```null, undefined, 42, 6.5, 'Hello', {} or {k: [{}, 1, 2]}```
 */
function anything(): Arbitrary<any>;
/**
 * For any type of values following the constraints defined by `settings`
 *
 * You may use {@link sample} to preview the values that will be generated
 *
 * @example
 * ```null, undefined, 42, 6.5, 'Hello', {} or {k: [{}, 1, 2]}```
 *
 * @example
 * ```typescript
 * // Using custom settings
 * fc.anything({
 *     key: fc.char(),
 *     values: [fc.integer(10,20), fc.constant(42)],
 *     maxDepth: 2
 * });
 * // Can build entries such as:
 * // - 19
 * // - [{"2":12,"k":15,"A":42}]
 * // - {"4":[19,13,14,14,42,11,20,11],"6":42,"7":16,"L":10,"'":[20,11],"e":[42,20,42,14,13,17]}
 * // - [42,42,42]...
 * ```
 *
 * @param settings Constraints to apply when building instances
 */
function anything(settings: ObjectConstraints.Settings): Arbitrary<any>;
function anything(settings?: ObjectConstraints.Settings): Arbitrary<any> {
  return anythingInternal(ObjectConstraints.from(settings));
}

/**
 * For any objects
 *
 * You may use {@link sample} to preview the values that will be generated
 *
 * @example
 * ```{} or {k: [{}, 1, 2]}```
 */
function object(): Arbitrary<any>;
/**
 * For any objects following the constraints defined by `settings`
 *
 * You may use {@link sample} to preview the values that will be generated
 *
 * @example
 * ```{} or {k: [{}, 1, 2]}```
 *
 * @param settings Constraints to apply when building instances
 */
function object(settings: ObjectConstraints.Settings): Arbitrary<any>;
function object(settings?: ObjectConstraints.Settings): Arbitrary<any> {
  return objectInternal(ObjectConstraints.from(settings));
}

/** @hidden */
function jsonSettings(stringArbitrary: Arbitrary<string>, maxDepth?: number) {
  const key = stringArbitrary;
  const values = [boolean(), integer(), double(), stringArbitrary, constant(null)];
  return maxDepth != null ? { key, values, maxDepth } : { key, values };
}

/**
 * For any JSON compliant values
 *
 * Keys and string values rely on {@link string}
 */
function jsonObject(): Arbitrary<any>;
/**
 * For any JSON compliant values with a maximal depth
 *
 * Keys and string values rely on {@link string}
 *
 * @param maxDepth Maximal depth of the generated values
 */
function jsonObject(maxDepth: number): Arbitrary<any>;
function jsonObject(maxDepth?: number): Arbitrary<any> {
  return anything(jsonSettings(string(), maxDepth));
}

/**
 * For any JSON compliant values with unicode support
 *
 * Keys and string values rely on {@link unicode}
 */
function unicodeJsonObject(): Arbitrary<any>;
/**
 * For any JSON compliant values with unicode support and a maximal depth
 *
 * Keys and string values rely on {@link unicode}
 *
 * @param maxDepth Maximal depth of the generated values
 */
function unicodeJsonObject(maxDepth: number): Arbitrary<any>;
function unicodeJsonObject(maxDepth?: number): Arbitrary<any> {
  return anything(jsonSettings(unicodeString(), maxDepth));
}

/**
 * For any JSON strings
 *
 * Keys and string values rely on {@link string}
 */
function json(): Arbitrary<string>;
/**
 * For any JSON strings with a maximal depth
 *
 * Keys and string values rely on {@link string}
 *
 * @param maxDepth Maximal depth of the generated objects
 */
function json(maxDepth: number): Arbitrary<string>;
function json(maxDepth?: number): Arbitrary<string> {
  const arb = maxDepth != null ? jsonObject(maxDepth) : jsonObject();
  return arb.map(JSON.stringify);
}

/**
 * For any JSON strings with unicode support
 *
 * Keys and string values rely on {@link unicode}
 */
function unicodeJson(): Arbitrary<string>;
/**
 * For any JSON strings with unicode support and a maximal depth
 *
 * Keys and string values rely on {@link unicode}
 *
 * @param maxDepth Maximal depth of the generated objects
 */
function unicodeJson(maxDepth: number): Arbitrary<string>;
function unicodeJson(maxDepth?: number): Arbitrary<string> {
  const arb = maxDepth != null ? unicodeJsonObject(maxDepth) : unicodeJsonObject();
  return arb.map(JSON.stringify);
}

export { anything, object, jsonObject, unicodeJsonObject, json, unicodeJson };
