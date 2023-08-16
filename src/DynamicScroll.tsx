import {
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

interface DataBase {
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
}

export interface DynamicChildElementProps {}

export interface LoadHandler<Data extends DataBase> {
  (
    index: number,
    props: DynamicChildProps,
    datas: DataEntry<Data>[],
    signal: AbortSignal
  ): Promise<[ReactElement<DynamicChildElementProps>, Data][]>;
}

interface DynamicScrollProps<Data extends DataBase> {
  prependSpace: number;
  appendSpace: number;
  onPrepend: LoadHandler<Data>;
  onAppend: LoadHandler<Data>;
}

const useRefState = <S,>(v: S | (() => S)) => {
  const [state, setState] = useState<S>(v);
  const ref = useRef(state);
  useLayoutEffect(() => {
    ref.current = state;
  });
  return [state, setState, ref] as const;
};


const getIndex = <T extends DataBase>(en: DataEntry<T>) => {
  return en.index;
};
const getHeight =  <T extends DataBase>(en: DataEntry<T>) => {
  return en.size ?? en.data.initialHeight;
};

const INTERATION_CHANGE_DELAY = 100;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export const DrynamicScroll = <T extends DataBase>(
  {
    prependSpace,
    appendSpace,
    onAppend,
    onPrepend
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
  const [hasFocusedInteraction, setHasFocusedInteraction, hasFocusedInteractionRef] = useRefState(false)
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
            flushSync(() => {
              setNegativeSpace(0)
            })
            const old = rootEl.scrollTop;
            rootEl.style.overflow = "hidden";
            rootEl.scrollTop = old + space;
            rootEl.style.overflow = "auto";
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
        flushSync(() => {
          setNegativeSpace(0)
        })
        const old = rootEl.scrollTop;
        rootEl.style.overflow = "hidden";
        rootEl.scrollTop = old + space;
        rootEl.style.overflow = "auto";
      }
    }
  }, [hasInteractionBefore, negativeSpaceRef, setHasInteraction, setNegativeSpace])

  const onSizeUpdate = useCallback((height: number, index: number) => {
    setDataStates(dataStates => dataStates.map((e) => {
      if (e.index !== index) {
        return e;
      } else {
        return {
          ...e,
          height,
        };
      }
    }));
  }, [setDataStates]);

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

  for (let i = 0; i < dataStates.length; i++) {
    if (currentBase === dataStates[i].index) {
      currentScroll += currentOffset;
      break;
    } else {
      currentScroll += getHeight(dataStates[i]);
    }
  }

  const fetchNext =
    dataStates.length === 0 || currentScroll + height >= heightSum;
  const fetchPrev =
    dataStates.length > 1 &&
    currentBase === getIndex(dataStates[0]) &&
    currentOffset < 0;

  useEffect(() => {
    if (fetchNext) {
      const controller = new AbortController();
      const signal = controller.signal;
      const lastIndex = dataStates[dataStates.length - 1]?.index;
      const index = lastIndex ? lastIndex : -1;
      const p = onAppend(index, { onSizeUpdate }, dataStates, signal);
      p.then((entries) => !signal.aborted && onInsert("next", entries));
      return () => {
        controller.abort();
      };
    } else if (fetchPrev) {
      const controller = new AbortController();
      const signal = controller.signal;
      const index = dataStates[0]?.index ?? 0;
      const p = onPrepend(index, { onSizeUpdate }, dataStates, signal);
      p.then((entries) => !signal.aborted && onInsert("prev", entries));
      return () => {
        controller.abort();
      };
    }
  }, [dataStates, onInsert, fetchNext, fetchPrev, onAppend, onPrepend, onSizeUpdate]);

  const elements = dataStates.map((s) => s.el);

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
      console.log(offset);
      console.log(newBase.index);
      return;
    }
    // in list
    let offset = prependSpace - negativeSpace;
    for (const item of dataStates) {
      const height = getHeight(item);
      if (offset + height > pos) {
        setCurrentOffset(pos - offset);
        setCurrentBase(item.index);
        console.log(pos - offset);
        console.log(item.index);
        return;
      }
      offset += height;
    }
    // overrun
    const item = dataStates[dataStates.length - 1];
    setCurrentOffset(pos - offset + getHeight(item));
    setCurrentBase(item.index);
    console.log(pos - offset + getHeight(item));
    console.log(item.index);
  };

  const onTouchStart: TouchEventHandler<HTMLDivElement> = (ev) => {
    console.log(ev)
    setHasFocusedInteraction(true)
    setHasInteractionBefore(Infinity)
  }

  const stopInterationShortly: TouchEventHandler<HTMLDivElement> = (ev) => {
    console.log(ev)
    setHasFocusedInteraction(false)
    setHasInteractionBefore(Date.now() + INTERATION_CHANGE_DELAY)
  }


  return (
    <div ref={onRefed} className="dyn root" onScroll={onScroll} onTouchStart={onTouchStart} onTouchEnd={stopInterationShortly}>
      <div style={{ height: `${prependSpace}px` }} />
      <div style={{ marginTop: `-${negativeSpace}px` }} />
      {elements}
      <div style={{ height: `${appendSpace}px` }} />
    </div>
  );
};
