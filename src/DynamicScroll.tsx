import {
  CSSProperties,
  ReactElement,
  TouchEventHandler,
  UIEventHandler,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import "./DynamicScroll.css";

export interface DataBase {
  index: number;
  initialHeight: number;
}

interface DataEntry<T extends DataBase> {
  index: number;
  el: ReactElement<DynamicChildElementProps>;
  size: null | number;
  data: T;
}

interface DynamicChildProps {
  onSizeUpdate: (newHeight: number, index: number) => void;
  resizeRef: (el: HTMLElement | null, index: number) => void
}

export interface DynamicChildElementProps {}

export interface LoadHandler<Data extends DataBase> {
  (
    index: number,
    props: DynamicChildProps,
    datas: DataEntry<Data>[],
    signal: AbortSignal,
  ): Promise<[ReactElement<DynamicChildElementProps>, Data][]>;
}

export interface AnchorSelector<Data extends DataBase> {
  (partialEntries: DataEntry<Data>[], index: number, offset: number, containerHeight: number, lastTouchPosition: number): [index: number, offset: number]
}
interface DynamicScrollProps<Data extends DataBase> {
  prependSpace: number;
  appendSpace: number;
  preloadRange?: number
  /** Default unload range.  
   * May be bumped if more content than expect loaded at once.  
   * Because it would unload content after loaded instantly otherwise.
   */
  maxLiveViewport?: number;
  onPrepend: LoadHandler<Data>;
  onAppend: LoadHandler<Data>;
  className?: string,
  style?: CSSProperties,
  onSelectAnchor?: AnchorSelector<Data>
}

const useRefState = <S,>(v: S | (() => S)) => {
  const [state, setState] = useState<S>(v);
  const ref = useRef(state);
  useLayoutEffect(() => {
    ref.current = state;
  });
  return [state, setState, ref] as const;
};


// const getIndex = <T extends DataBase>(en: DataEntry<T>) => {
//   return en.index;
// };
export const getHeight =  <T extends DataBase>(en: DataEntry<T>) => {
  return en.size ?? en.data.initialHeight;
};

const INTERATION_CHANGE_DELAY = 100;

const getIndexAndOffsetWithDistance = (entries: DataEntry<DataBase>[], distance: number): [index: number, offset: number] => {
  if (entries.length === 0) {
    return [0, distance]
  }

  if (distance < 0) {
    return [entries[0]!.index, distance]
  }

  let currentOffset = distance

  for (let i = 0; i < entries.length; i++) {
    const height = getHeight(entries[i])
    if (currentOffset < height) {
      return [entries[i]!.index, currentOffset]
    }
    currentOffset -= height
  }

  const lastHeight = getHeight(entries[entries.length - 1])

  return [entries[entries.length - 1]!.index, currentOffset + lastHeight]
}

// const getIndexAndOffsetWithDistanceFromEnd = (entries: DataEntry<DataBase>[], distance: number): [index: number, offset: number] => {
//   if (entries.length === 0) {
//     return [0, -distance]
//   }

//   if (distance < 0) {
//     return [entries[entries.length - 1]!.index, -distance]
//   }

//   let currentOffset = distance

//   for (let i = entries.length - 1; i >= 0; i--) {
//     const height = getHeight(entries[i])
//     if (currentOffset < height) {
//       return [entries[i]!.index, height - currentOffset]
//     }
//     currentOffset -= height
//   }

//   const lastHeight = getHeight(entries[0])

//   return [entries[entries.length - 1]!.index, lastHeight - (currentOffset + lastHeight)]
// }

const getDistanceWithIndexAndOffset = (entries: DataEntry<DataBase>[], index: number, offset: number): number => {
  if (entries.length === 0) {
    return offset
  }
  let heightSum = 0
  for (let i = 0; i < entries.length; i++) {
    const currentIndex = entries[i].index
    if (currentIndex === index) {
      return heightSum + offset
    }
    heightSum += getHeight(entries[i])
  }
  throw new Error('invalid index ' + index)
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export const DynamicScroll = <T extends DataBase>(
  {
    prependSpace,
    appendSpace,
    maxLiveViewport = 3000,
    preloadRange = 1000,
    onAppend,
    onPrepend,
    className,
    onSelectAnchor,
    style
  }: DynamicScrollProps<T>
) => {
  const [dataStates, setDataStates, dataStateRef] = useRefState<DataEntry<T>[]>(
    []
  );

  const [currentBase, setCurrentBase, currentBaseRef] = useRefState<number>(0);
  const [currentOffset, setCurrentOffset, currentOffsetRef] =
    useRefState<number>(0);

  // height detection
  const [height, setHeight] = useState(0);

  const onRefed = useCallback((el: HTMLDivElement) => {
    if (el) {
      el.scrollTop = prependSpace;
    }
    scrollerRef.current = el;
  }, [prependSpace]);

  const scrollerRef = useRef<HTMLDivElement>();

  const lastInteractPosition = useRef(0)

  // we don't want to unload content that we just loaded
  // const minUnloadDistance = useRefState(0)

  useLayoutEffect(() => {
    if (scrollerRef.current) {
      setHeight(scrollerRef.current!.offsetHeight);
      const cb: ResizeObserverCallback = () => {
        setHeight(scrollerRef.current!.offsetHeight);
      }
      const observer = new ResizeObserver(cb)
      observer.observe(scrollerRef.current)
      return () => {
        observer.disconnect()
      }
    }
    
  }, []);

  // const [fetchState, setFetchState] = useState<State>({ state: "init" });

  const [hasInteractionBefore, setHasInteractionBefore] = useState(0)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hasFocusedInteraction, setHasFocusedInteraction] = useRefState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hasInteraction, setHasInteraction, hasInteractionRef] = useRefState(false)
  /** 0 ~ Infinity */
  const [negativeSpace, setNegativeSpace, negativeSpaceRef] = useRefState(0)

  useEffect(() => {
    const now = Date.now()
    if (hasInteractionBefore > now) {
      setHasInteraction(true)
      if (hasInteractionBefore !== Infinity) {
        const id = setTimeout(() => {
          setHasInteraction(false)
          if (negativeSpaceRef.current !== 0) {
            const space = negativeSpaceRef.current
            const rootEl = scrollerRef.current!
            const old = rootEl.scrollTop;
            flushSync(() => {
              setNegativeSpace(0)
            })
            rootEl.style.overflow = "hidden";
            rootEl.scrollTop = old + space;
            rootEl.style.overflow = "auto";
            // console.log('flush stash ' + space)
          }
        }, hasInteractionBefore - now)
        return () => {
          clearTimeout(id)
        }
      }
      return
    } else {
      setHasInteraction(false)
      if (negativeSpaceRef.current !== 0) {
        const space = negativeSpaceRef.current
        const rootEl = scrollerRef.current!
        const old = rootEl.scrollTop;
        flushSync(() => {
          setNegativeSpace(0)
        })
        rootEl.style.overflow = "hidden";
        rootEl.scrollTop = old + space;
        rootEl.style.overflow = "auto";
      }
    }
  }, [hasInteractionBefore, negativeSpaceRef, setHasInteraction, setNegativeSpace])

  const onSizeUpdateLatest = (newObjectHeight: number, index: number) => {
    const oldEntry = dataStates.find(i => i.index === index)
    if (oldEntry && getHeight(oldEntry) === newObjectHeight) {
      console.log('skip size update for index ' + index + ' because not changed')
      return
    }

    const targetIndex = dataStates.findIndex(i => i.index === currentBase) + 1
    const originalTargetBase = dataStates[targetIndex] != null && currentOffset !== 0 ? dataStates[targetIndex].index : currentBase
    const originalTargetOffset = dataStates[targetIndex] != null && currentOffset !== 0 ? currentOffset - getHeight(dataStates[targetIndex - 1]) : currentOffset
    const selectorRes = onSelectAnchor?.(dataStates, originalTargetBase, originalTargetOffset, height, lastInteractPosition.current)
    const targetBase = selectorRes?.[0] ?? originalTargetBase
    const targetOffset = selectorRes?.[1] ?? originalTargetOffset
    const oldScrollDistance = getDistanceWithIndexAndOffset(dataStates, currentBase, currentOffset)
    const oldDistance = getDistanceWithIndexAndOffset(dataStates, targetBase, targetOffset)
    const newStates = dataStates.map((e) => {
      if (e.index !== index) {
        return e;
      } else {
        return {
          ...e,
          size: newObjectHeight,
        };
      }
    })
    const newDistance = getDistanceWithIndexAndOffset(newStates, targetBase, targetOffset)
    const [newBase, newOffset] = getIndexAndOffsetWithDistance(newStates, oldScrollDistance + newDistance - oldDistance)

    if (hasInteraction) {
      flushSync(() => {
        setNegativeSpace(num => num + (newDistance - oldDistance))
        setDataStates(newStates);
        setCurrentBase(newBase);
        setCurrentOffset(newOffset);
      })
    } else {
      const space = negativeSpace + (newDistance - oldDistance)
      const rootEl = scrollerRef.current!
      const old = rootEl.scrollTop;
      flushSync(() => {
        setDataStates(newStates);
        setNegativeSpace(0);
        setCurrentBase(newBase);
        setCurrentOffset(newOffset);
      })
      rootEl.style.overflow = "hidden";
      rootEl.scrollTop = old + space;
      rootEl.style.overflow = "auto";

    }
  }

  const onSizeUpdateRef = useRef(onSizeUpdateLatest)

  useLayoutEffect(() => {
    onSizeUpdateRef.current = onSizeUpdateLatest
  })

  const onSizeUpdate = useCallback((height: number, index: number) => {
    onSizeUpdateRef.current(height, index)
  }, []);

  const onInsert = useCallback(
    (
      position: "prev" | "next",
      entries: [el: ReactElement<DynamicChildElementProps>, data: T][]
    ) => {
      const rootEl = scrollerRef.current!;
      const heightSum = entries
        .map((e) => e[1].initialHeight)
        .reduce((p, v) => p + v, 0);
      flushSync(() => {
        if (position === "prev") {
          setDataStates((d) => [
            ...entries.map((e) => ({
              index: e[1].index,
              el: e[0],
              size: null,
              data: e[1],
            })),
            ...d,
          ]);
        } else if (position === "next") {
          setDataStates((d) => [
            ...d,
            ...entries.map((e) => ({
              index: e[1].index,
              el: e[0],
              size: null,
              data: e[1],
            })),
          ]);
        }

        if (currentOffsetRef.current < 0 && position === "prev") {
          // update offset and currentBase
          let target = -1;
          let newOffset = currentOffsetRef.current;
          while (newOffset < 0 && entries[entries.length + target]) {
            newOffset += entries[entries.length + target][1].initialHeight;
            target--;
          }
          setCurrentBase(entries[entries.length + target + 1][1].index);
          setCurrentOffset(newOffset);
        }
        const lastItem = dataStateRef.current[dataStateRef.current.length - 1];
        if (
          position === "next" &&
          lastItem &&
          lastItem.index === currentBaseRef.current &&
          currentOffsetRef.current > getHeight(lastItem)
        ) {
          // update offset and currentBase
          let target = 0;
          let newOffset = currentOffsetRef.current - getHeight(lastItem);
          while (
            entries[target] &&
            newOffset > entries[target][1].initialHeight
          ) {
            newOffset -= entries[target][1].initialHeight;
            target++;
          }
          // overrun
          if (entries[target] == null) {
            // go back by one
            target -= 1;
            newOffset += entries[entries.length - 1][1].initialHeight;
          }
          setCurrentBase(entries[target][1].index);
          setCurrentOffset(newOffset);
        }
      });
      // debugger
      if (position === "prev") {
        if (hasInteractionRef.current) {
          flushSync(() => {
            setNegativeSpace(val => val + heightSum)
          })
        } else {
          const old = rootEl.scrollTop;
          // rootEl.style.overflow = "hidden";
          rootEl.scrollTop = old + heightSum;
          // rootEl.style.overflow = "auto";
        }
      }
    },
    [currentBaseRef, currentOffsetRef, dataStateRef, hasInteractionRef, setCurrentBase, setCurrentOffset, setDataStates, setNegativeSpace]
  );

  // calculate whether we need to fetch more

  const heightSum = dataStates
    .map((i) => i.size ?? i.data.initialHeight)
    .reduce((p, v) => p + v, 0);
  let currentScroll = 0;

  let itemIndex: number = -1
  for (let i = 0; i < dataStates.length; i++) {
    if (currentBase === dataStates[i].index) {
      currentScroll += currentOffset;
      itemIndex = i
      break;
    } else {
      currentScroll += getHeight(dataStates[i]);
    }
  }

  const fetchNext =
    dataStates.length === 0 || currentScroll + height >= heightSum - preloadRange;
  const fetchPrev =
    !fetchNext &&
    dataStates.length > 1 &&
    currentScroll < preloadRange;

  const trimPrev = !(fetchNext || fetchPrev ) && currentScroll > maxLiveViewport 
  const trimNext = !(trimPrev || fetchNext || fetchPrev ) && heightSum - currentScroll > maxLiveViewport

  const trimItemIndex = (trimPrev || trimNext) ? itemIndex : 0
  const trimOffset = (trimPrev || trimNext) ? currentOffset : 0
  const trimHasInteraction = (trimPrev || trimNext) ? hasInteraction : false

  const [observer, setObserver] = useState<ResizeObserver>()
  const [entries, setEntries] = useState<[el: HTMLElement, index: number][]>([])

  const observerHandlerCurrent: ResizeObserverCallback = (eventEntries) => {
    for (const ee of eventEntries) {
      const item = entries.find(e => e[0] === ee.target)
      if (item != null) {
        onSizeUpdate(ee.contentRect.height, item[1])
      }
    }
  }

  const observerHandlerRef = useRef(observerHandlerCurrent)
  useLayoutEffect(() => {
    observerHandlerRef.current = observerHandlerCurrent
  })

  const observerHandler: ResizeObserverCallback = useCallback((entries, observer) => {
    observerHandlerRef.current?.(entries, observer)
  }, [])


  useEffect(() => {
    const newObserver = new ResizeObserver(observerHandler)
    setObserver(newObserver)
    return () => {
      newObserver.disconnect()
    }
  }, [observerHandler])


  useEffect(() => {
    if (observer == null) {
      return
    }

    for (const [el] of entries) {
      observer.observe(el)
    }

    return () => {
      for (const [el] of entries) {
        observer.unobserve(el)
      }
    }
  }, [entries, observer])

  const resizeRef = useCallback((el: HTMLElement | null, index: number) => {
    setEntries((entries) => {
      const entryIndex = entries.findIndex(e => e[1] === index)
      if (el) {
        if (entryIndex >= 0) {
          return [...entries.slice(0, entryIndex), [el, index], ...entries.slice(index + 1)]
        } else {
          return [...entries.slice(0), [el, index]]
        }
      } else {
        return entries.filter(i => i[1] !== index)
      }
    })
  }, [])

  useEffect(() => {
    if (fetchNext) {
      const controller = new AbortController();
      const signal = controller.signal;
      const lastIndex = dataStates[dataStates.length - 1]?.index;
      const index = lastIndex ? lastIndex : -1;
      const p = onAppend(index, { onSizeUpdate, resizeRef }, dataStates, signal);
      p.then((entries) => !signal.aborted && onInsert("next", entries));
      return () => {
        controller.abort();
      };
    } else if (fetchPrev) {
      const controller = new AbortController();
      const signal = controller.signal;
      const index = dataStates[0]?.index ?? 0;
      const p = onPrepend(index, { onSizeUpdate, resizeRef }, dataStates, signal);
      p.then((entries) => !signal.aborted && onInsert("prev", entries));
      return () => {
        controller.abort();
      };
    } else if (trimPrev) {
      const id = setTimeout(() => {

        let length = 0
        let removeUntil = 0
  
        for (let i = trimItemIndex; i >= 0; i--) {
          let newLength
          if (i === trimItemIndex) {
            newLength = length + trimOffset
          } else {
            newLength = length +  getHeight(dataStates[i])
          }
          if (newLength >= maxLiveViewport) {
            break
          }
          removeUntil = i
          length = newLength
        }
  
        const sumDiff = dataStates.slice(0, removeUntil).map(i => getHeight(i)).reduce((p, v) => p + v, 0)
  
        // remove element
        if (trimHasInteraction) {
          flushSync(() => {
            setDataStates(ds => ds.slice(removeUntil))
            setNegativeSpace(val => val - sumDiff)
          })
        } else {
          flushSync(() => {
            setDataStates(ds => ds.slice(removeUntil))
          })
          if (scrollerRef.current) {
            const old = scrollerRef.current.scrollTop;
            // rootEl.style.overflow = "hidden";
            scrollerRef.current.scrollTop = old - sumDiff;
            // rootEl.style.overflow = "auto";
          }
        }
      })
      return () => {
        clearTimeout(id)
      }
    } else if (trimNext) {
      const id = setTimeout(() => {

        let length = 0
        let removeAfter = 0
  
        for (let i = trimItemIndex; i < dataStates.length - 1; i++) {
          let newLength
          if (i === trimItemIndex) {
            newLength = getHeight(dataStates[i]) - trimOffset
          } else {
            newLength = length +  getHeight(dataStates[i])
          }
          if (newLength >= maxLiveViewport) {
            break
          }
          removeAfter = i
          length = newLength
        }

        setDataStates(ds => ds.slice(0, removeAfter))
      })
      return () => {
        clearTimeout(id)
      }
    }
  }, [dataStates, onInsert, fetchNext, fetchPrev, onAppend, onPrepend, onSizeUpdate, trimPrev, trimNext, trimHasInteraction, trimItemIndex, maxLiveViewport, trimOffset, setDataStates, setNegativeSpace, heightSum, resizeRef]);

  const elements = dataStates.map((s) => <div key={s.index} style={{ height: `${getHeight(s)}px` }}>{s.el}</div>);

  const onScroll: UIEventHandler<HTMLDivElement> = (ev) => {
    if (hasFocusedInteraction) {
      setHasInteractionBefore(Infinity)
    } else {
      setHasInteractionBefore(Date.now() + INTERATION_CHANGE_DELAY)
    }

    if (dataStates.length === 0) {
      return;
    }

    const pos = ev.currentTarget.scrollTop;

    if (pos < 0) {
      ev.currentTarget.style.overflow = 'hidden'
      ev.currentTarget.scrollTop = 0
      ev.currentTarget.style.overflow = 'auto'
    }

    // at pre-position
    if (pos < prependSpace - negativeSpace) {
      const newBase = dataStates[0];
      if (newBase == null) return;
      const offset = pos - prependSpace;
      setCurrentOffset(offset);
      setCurrentBase(newBase.index);
      // console.log(offset);
      // console.log(newBase.index);
      return;
    }
    // in list
    let offset = prependSpace - negativeSpace;
    for (const item of dataStates) {
      const height = getHeight(item);
      if (offset + height > pos) {
        setCurrentOffset(pos - offset);
        setCurrentBase(item.index);
        // console.log(pos - offset);
        // console.log(item.index);
        return;
      }
      offset += height;
    }
    // overrun
    const item = dataStates[dataStates.length - 1];
    setCurrentOffset(pos - offset + getHeight(item));
    setCurrentBase(item.index);
    // console.log(pos - offset + getHeight(item));
    // console.log(item.index);
  };

  const onTouchMove: TouchEventHandler<HTMLDivElement> = (ev) => {
    const baseY = ev.currentTarget.getBoundingClientRect().top
    lastInteractPosition.current = ev.changedTouches[0].clientY - baseY
  }
  const onTouchStart: TouchEventHandler<HTMLDivElement> = (ev) => {
    // console.log(ev)
    setHasFocusedInteraction(true)
    setHasInteractionBefore(Infinity)
    const baseY = ev.currentTarget.getBoundingClientRect().top
    lastInteractPosition.current = ev.changedTouches[0].clientY - baseY
  }
  const onTouchEnd: TouchEventHandler<HTMLDivElement> = (ev) => {
    // console.log(ev)
    stopInteractionShortly(ev)
    const baseY = ev.currentTarget.getBoundingClientRect().top
    lastInteractPosition.current = ev.changedTouches[0].clientY - baseY
  }

  const stopInteractionShortly: TouchEventHandler<HTMLDivElement> = () => {
    // console.log(ev)
    setHasFocusedInteraction(false)
    setHasInteractionBefore(Date.now() + INTERATION_CHANGE_DELAY)
  }


  return (
    <div ref={onRefed} style={style} className={'dyn root' + (className ? `  ${className}` : '')} onScroll={onScroll} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div style={{ height: `${prependSpace}px` }} />
      <div style={{ marginTop: `${-negativeSpace}px` }} />
      {elements}
      <div style={{ height: `${appendSpace}px` }} />
    </div>
  );
};
