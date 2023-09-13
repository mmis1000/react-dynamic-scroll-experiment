import { useRef, useInsertionEffect, useCallback } from 'react';

import { DataBase, DataEntry } from "./DynamicScroll";

export const END_OF_STREAM = Symbol('END_OF_STREAM')

export const getHeight =  <T extends DataBase>(en: DataEntry<T>) => {
  return en.size
};


// The useEvent API has not yet been added to React,
// so this is a temporary shim to make this sandbox work.
// You're not expected to write code like this yourself.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any

export function useEvent<T extends AnyFn>(fn: T) {
  const ref = useRef(fn);
  useInsertionEffect(() => {
    ref.current = fn;
  }, [fn]);
  return useCallback((...args: Parameters<T>) => {
    const f = ref.current;
    return f(...args);
  }, []) as T;
}