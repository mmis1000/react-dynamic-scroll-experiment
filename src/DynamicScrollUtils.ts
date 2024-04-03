import { useRef, useInsertionEffect, useCallback, useState, useEffect, RefObject, useLayoutEffect } from 'react';

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
            [el, index] satisfies [HTMLElement, number],
            ...entries.slice(index + 1),
          ];
        } else {
          return [...entries.slice(0), [el, index] satisfies [HTMLElement, number]];
        }
      } else {
        return entries.filter((i) => i[1] !== index);
      }
    });
  }, []);

  return resizeRef
}

const hasScrollingEndSupport = 'onscrollend' in window
const INTERACTION_DELAY = 200

export const useScrollingEvent = ({ ref, onScrollChange }: { ref: RefObject<HTMLElement>, onScrollChange: (status: boolean) => void}) => {
  const currentlyScrolling = useRef(false)
  const skipNextEnd = useRef(false)

  const holding = useRef(false)

  const updateScrolling = useEvent((status: boolean) => {
    onScrollChange(status)
    currentlyScrolling.current = status
  })

  useLayoutEffect(() => {
    if (ref.current == null) return
    const el = ref.current
    
    let id: ReturnType<typeof setTimeout> | null = null

    const onTimeout = () => {
      // assume scroll stopped if not holding
      if (!holding.current && currentlyScrolling.current) {
        updateScrolling(false)
        // console.log('scroll end by timeout', Date.now())
      }
    }

    const onScroll = (_ev: Event) => {
      if (!currentlyScrolling.current && !skipNextEnd.current) {
        updateScrolling(true)
        // console.log('scroll start', Date.now(), ev)
      } else {
        // console.log('scroll', Date.now(), ev)
      }
      if (id != null) {
        clearTimeout(id)
      }
      id = setTimeout(onTimeout, INTERACTION_DELAY)
    }

    const onScrollEnd = (_ev: Event) => {
      if (skipNextEnd.current) {
        skipNextEnd.current = false
        // console.log('scroll end(skipped)', Date.now(), ev)
        return
      }

      if (currentlyScrolling.current) {
        if (holding.current) {
          // console.log('scroll end(skipped because user holding screen)', Date.now(), ev)
        }
        updateScrolling(false)
        // console.log('scroll end', Date.now(), ev)
        if (id != null) {
          clearTimeout(id)
        }
      }
    }

    const onTouchStart = () => {
      if (!currentlyScrolling.current) {
        updateScrolling(true)
        // console.log('scroll start because touch', Date.now())
      }

      holding.current = true
      if (id != null) {
        clearTimeout(id)
      }
    }

    const onTouchEnd = (ev: TouchEvent) => {
      // console.log(ev)
      for (const touch of ev.touches) {
        if (el.contains(touch.target as Element)) {
          return
        }
      }
      holding.current = false
      if (id != null) {
        clearTimeout(id)
      }
      id = setTimeout(onTimeout, INTERACTION_DELAY)
    }

    el.addEventListener('scroll', onScroll)
    el.addEventListener('scrollend', onScrollEnd)
    el.addEventListener('touchstart', onTouchStart)
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', onScrollEnd)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [ref, updateScrolling])

  const markScrollChange = useCallback(() => {
    if (hasScrollingEndSupport) {
      skipNextEnd.current = true
    }
  }, [])

  return markScrollChange
}