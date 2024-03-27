import { useRef, useInsertionEffect, useCallback, useState, useEffect } from 'react';

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

export function useObserveElements(onSizeUpdate: (height: number, index: number) => void) {
  const [observer, setObserver] = useState<ResizeObserver>();
  const [entries, setEntries] = useState<[el: HTMLElement, index: number][]>(
    []
  );

  const observerHandler: ResizeObserverCallback = useEvent((eventEntries) => {
    for (const ee of eventEntries) {
      const item = entries.find((e) => e[0] === ee.target);
      if (item != null) {
        onSizeUpdate(ee.contentRect.height, item[1]);
      }
    }
  });

  useEffect(() => {
    const newObserver = new ResizeObserver(observerHandler);
    setObserver(newObserver);
    return () => {
      newObserver.disconnect();
    };
  }, [observerHandler]);

  useEffect(() => {
    if (observer == null) {
      return;
    }

    for (const [el] of entries) {
      observer.observe(el);
    }

    return () => {
      for (const [el] of entries) {
        observer.unobserve(el);
      }
    };
  }, [entries, observer]);

  const resizeRef = useCallback((el: HTMLElement | null, index: number) => {
    setEntries((entries) => {
      const entryIndex = entries.findIndex((e) => e[1] === index);
      if (el) {
        if (entryIndex >= 0) {
          return [
            ...entries.slice(0, entryIndex),
            [el, index],
            ...entries.slice(index + 1),
          ];
        } else {
          return [...entries.slice(0), [el, index] as const];
        }
      } else {
        return entries.filter((i) => i[1] !== index);
      }
    });
  }, []);

  return resizeRef
}