import {
  CSSProperties,
  ReactElement,
  ReactNode,
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
import { END_OF_STREAM, getHeight, useEvent } from "./DynamicScrollUtils";

export interface DataBase {
  index: number;
  initialHeight: number;
}

export interface DataEntry<T extends DataBase> {
  index: number;
  el: ReactElement<DynamicChildElementProps>;
  size: number;
  data: T;
}

export interface DynamicChildElementProps {}

export interface EntryFactory {
  (index: number, size: number): {
    resizeRef: (el: HTMLElement | null) => void;
    updateSize: (newHeight: number) => void;
    index: number;
  };
}

export interface LoadHandler<Data extends DataBase> {
  (
    direction: "next" | "prev",
    factory: EntryFactory,
    datas: DataEntry<Data>[],
    signal: AbortSignal
  ): Promise<
    [ReactElement<DynamicChildElementProps>, Data][] | typeof END_OF_STREAM
  >;
}

export interface ProgressHandler<Data extends DataBase> {
  (current: DataEntry<Data>, offset: number, dataList: DataEntry<Data>[]): void;
}

export interface AnchorSelector<Data extends DataBase> {
  (
    partialEntries: DataEntry<Data>[],
    index: number,
    offset: number,
    containerHeight: number,
    lastTouchPosition: number
  ): [index: number, offset: number];
}

function fixFreezingScrollBar(el: HTMLElement, scrollPos: number) {
  el.scrollTop = scrollPos + 1;
  el.scrollTo({ top: scrollPos });
}

interface RawDynamicScrollProps<Data extends DataBase> {
  prependSpace?: number;
  appendSpace?: number;
  preloadRange?: number;
  /** Default unload range.
   * May be bumped if more content than expect loaded at once.
   * Because it would unload content after loaded instantly otherwise.
   */
  maxLiveViewport?: number;
  onLoadMore: LoadHandler<Data>;
  onProgress?: ProgressHandler<Data>;
  className?: string;
  style?: CSSProperties;
  prependContent?: ReactNode;
  appendContent?: ReactNode;
  onSelectAnchor?: AnchorSelector<Data>;
}

type DivProps = React.HTMLAttributes<HTMLDivElement>;

type DynamicScrollProps<Data extends DataBase> = Omit<
  DivProps,
  keyof RawDynamicScrollProps<Data>
> &
  RawDynamicScrollProps<Data>;

const useRefState = <S,>(v: S | (() => S)) => {
  const [state, setState] = useState<S>(v);
  const ref = useRef(state);
  useLayoutEffect(() => {
    ref.current = state;
  });
  return [state, setState, ref] as const;
};

const INTERACTION_CHANGE_DELAY = 100;

const getIndexAndOffsetWithDistance = (
  entries: DataEntry<DataBase>[],
  distance: number
): [index: number, offset: number] => {
  if (entries.length === 0) {
    return [0, distance];
  }

  if (distance < 0) {
    return [entries[0]!.index, distance];
  }

  let currentOffset = distance;

  for (let i = 0; i < entries.length; i++) {
    const height = getHeight(entries[i]);
    if (currentOffset < height) {
      return [entries[i]!.index, currentOffset];
    }
    currentOffset -= height;
  }

  const lastHeight = getHeight(entries[entries.length - 1]);

  return [entries[entries.length - 1]!.index, currentOffset + lastHeight];
};

const getDistanceWithIndexAndOffset = (
  entries: DataEntry<DataBase>[],
  index: number,
  offset: number
): number => {
  if (entries.length === 0) {
    return offset;
  }
  let heightSum = 0;
  for (let i = 0; i < entries.length; i++) {
    const currentIndex = entries[i].index;
    if (currentIndex === index) {
      return heightSum + offset;
    }
    heightSum += getHeight(entries[i]);
  }
  // it can happen if the scroll started at end with 0 items already appended
  return 0;
  // throw new Error('invalid index ' + index)
};

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export const DynamicScroll = <T extends DataBase>({
  prependSpace = 0,
  appendSpace = 0,
  maxLiveViewport: maxLiveViewportProp = 3000,
  preloadRange = 1000,
  onLoadMore,
  onProgress = () => {},
  prependContent,
  appendContent,
  className,
  onSelectAnchor,
  style,
  ...props
}: DynamicScrollProps<T>) => {
  const onLoadMoreEvent = useEvent(onLoadMore);
  const [dataStates, setDataStates, dataStateRef] = useRefState<DataEntry<T>[]>(
    []
  );

  const [minMaxLiveViewport, setMinMaxLiveViewport] = useState(0);
  const maxLiveViewport = Math.max(maxLiveViewportProp, minMaxLiveViewport);

  const [currentBase, setCurrentBase, currentBaseRef] = useRefState<number>(0);
  const [currentOffset, setCurrentOffset, currentOffsetRef] =
    useRefState<number>(0);

  // height detection
  const [height, setHeight, heightRef] = useRefState(0);

  const [headEnded, setHeadEnded, headEndedRef] = useRefState(false);
  const [footEnded, setFootEnded, footEndedRef] = useRefState(false);

  const heightSum = dataStates
    .map((i) => i.size ?? i.data.initialHeight)
    .reduce((p, v) => p + v, 0);

  const currentPrependSpace = headEnded ? 0 : prependSpace;
  const currentAppendSpace = Math.max(
    footEnded ? 0 : appendSpace,
    heightSum < height ? height : 0
  );

  const onRefed = useCallback(
    (el: HTMLDivElement) => {
      if (el) {
        el.scrollTop = prependSpace;
      }
      scrollerRef.current = el;
    },
    [prependSpace]
  );

  const scrollerRef = useRef<HTMLDivElement>();

  const lastInteractPosition = useRef(0);

  // we don't want to unload content that we just loaded
  // const minUnloadDistance = useRefState(0)

  useLayoutEffect(() => {
    const root = scrollerRef.current;
    if (root) {
      const cb: ResizeObserverCallback = () => {
        const prevHeight = heightRef.current;
        if (prevHeight === 0) {
          flushSync(() => {
            setHeight(root.offsetHeight);
          });
          root.scrollTop = prependSpace;
        } else {
          setHeight(root.offsetHeight);
        }
      };
      const observer = new ResizeObserver(cb);
      observer.observe(root);
      return () => {
        observer.disconnect();
      };
    }
  }, [heightRef, prependSpace, setHeight]);

  const [hasInteractionBefore, setHasInteractionBefore] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hasFocusedInteraction, setHasFocusedInteraction] = useRefState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hasInteraction, setHasInteraction, hasInteractionRef] =
    useRefState(false);
  /** 0 ~ Infinity */
  const [negativeSpace, setNegativeSpace, negativeSpaceRef] = useRefState(0);

  const onProgressEvent = useEvent((index: number, offset: number) => {
    const item = dataStates.find((i) => i.index === index);
    if (!item) {
      console.warn("emitted progess without item");
      return;
    }
    onProgress(item, offset, dataStates);
  });

  useEffect(() => {
    const now = Date.now();
    if (hasInteractionBefore > now) {
      setHasInteraction(true);
      if (hasInteractionBefore !== Infinity) {
        const id = setTimeout(() => {
          setHasInteraction(false);
          if (negativeSpaceRef.current !== 0) {
            const space = negativeSpaceRef.current;
            const rootEl = scrollerRef.current!;
            const old = rootEl.scrollTop;
            flushSync(() => {
              setNegativeSpace(0);
            });
            rootEl.style.overflow = "hidden";
            rootEl.scrollTop = old + space;
            rootEl.style.overflow = "auto";
            // FIXME: safari scroll workaround
            fixFreezingScrollBar(rootEl, old + space);
            // console.log('flush stash ' + space)
          }
        }, hasInteractionBefore - now);
        return () => {
          clearTimeout(id);
        };
      }
      return;
    } else {
      setHasInteraction(false);
      if (negativeSpaceRef.current !== 0) {
        const space = negativeSpaceRef.current;
        const rootEl = scrollerRef.current!;
        const old = rootEl.scrollTop;
        flushSync(() => {
          setNegativeSpace(0);
        });
        rootEl.style.overflow = "hidden";
        rootEl.scrollTop = old + space;
        rootEl.style.overflow = "auto";
        // FIXME: safari scroll workaround
        fixFreezingScrollBar(rootEl, old + space);
      }
    }
  }, [
    hasInteractionBefore,
    negativeSpaceRef,
    setHasInteraction,
    setNegativeSpace,
  ]);

  const onSizeUpdate = useEvent((newObjectHeight: number, index: number) => {
    const oldEntry = dataStates.find((i) => i.index === index);
    if (oldEntry && getHeight(oldEntry) === newObjectHeight) {
      return;
    }

    const targetIndex =
      dataStates.findIndex((i) => i.index === currentBase) + 1;
    const originalTargetBase =
      dataStates[targetIndex] != null && currentOffset !== 0
        ? dataStates[targetIndex].index
        : currentBase;
    const originalTargetOffset =
      dataStates[targetIndex] != null && currentOffset !== 0
        ? currentOffset - getHeight(dataStates[targetIndex - 1])
        : currentOffset;
    const selectorRes = onSelectAnchor?.(
      dataStates,
      originalTargetBase,
      originalTargetOffset,
      height,
      lastInteractPosition.current
    );
    const targetBase = selectorRes?.[0] ?? originalTargetBase;
    const targetOffset = selectorRes?.[1] ?? originalTargetOffset;
    const oldScrollDistance = getDistanceWithIndexAndOffset(
      dataStates,
      currentBase,
      currentOffset
    );
    const oldDistance = getDistanceWithIndexAndOffset(
      dataStates,
      targetBase,
      targetOffset
    );
    const newStates = dataStates.map((e) => {
      if (e.index !== index) {
        return e;
      } else {
        return {
          ...e,
          size: newObjectHeight,
        };
      }
    });
    const newDistance = getDistanceWithIndexAndOffset(
      newStates,
      targetBase,
      targetOffset
    );

    const oldFullHeight = dataStates
      .map((i) => getHeight(i))
      .reduce((p, v) => p + v, 0);
    const preRemovalPending =
      oldDistance > Math.max(minMaxLiveViewport, maxLiveViewport);
    const postRemovalPending =
      oldFullHeight - oldDistance - height >
      Math.max(minMaxLiveViewport, maxLiveViewport);

    const newFullHeight = newStates
      .map((i) => getHeight(i))
      .reduce((p, v) => p + v, 0);

    const preDist = newDistance;
    const postDist = newFullHeight - height - newDistance;

    const insertBefore = newDistance > oldDistance;

    const newSafeUnloadDist = insertBefore
      ? preRemovalPending
        ? minMaxLiveViewport
        : Math.max(preDist, minMaxLiveViewport)
      : postRemovalPending
      ? minMaxLiveViewport
      : Math.max(postDist, minMaxLiveViewport);

    // console.log(minMaxLiveViewport, newSafeUnloadDist);

    const [newBase, newOffset] = getIndexAndOffsetWithDistance(
      newStates,
      oldScrollDistance + newDistance - oldDistance
    );

    if (hasInteraction) {
      flushSync(() => {
        setMinMaxLiveViewport(newSafeUnloadDist)
        setNegativeSpace((num) => num + (newDistance - oldDistance));
        setDataStates(newStates);
        setCurrentBase(newBase);
        setCurrentOffset(newOffset);
      });
      onProgressEvent(newBase, newOffset);
    } else {
      const space = negativeSpace + (newDistance - oldDistance);
      const rootEl = scrollerRef.current!;
      const old = rootEl.scrollTop;
      flushSync(() => {
        setMinMaxLiveViewport(newSafeUnloadDist)
        setDataStates(newStates);
        setNegativeSpace(0);
        setCurrentBase(newBase);
        setCurrentOffset(newOffset);
      });
      rootEl.style.overflow = "hidden";
      rootEl.scrollTop = old + space;
      rootEl.style.overflow = "auto";
      onProgressEvent(newBase, newOffset);
    }
  });

  const onInsert = useCallback(
    (
      position: "prev" | "next",
      entries:
        | [el: ReactElement<DynamicChildElementProps>, data: T][]
        | typeof END_OF_STREAM
    ) => {
      const rootEl = scrollerRef.current!;
      const initialHeightSum = dataStateRef.current.reduce(
        (prev, curr) => getHeight(curr) + prev,
        0
      );
      const isInitialInsert = initialHeightSum < heightRef.current;

      if (entries === END_OF_STREAM) {
        if (position === "next" && !footEndedRef.current) {
          setFootEnded(true);
        }
        if (position === "prev" && !headEndedRef.current) {
          const needScrollCorrection =
            currentOffsetRef.current < 0 &&
            currentBaseRef.current === dataStateRef.current[0]?.index;
          if (hasInteractionRef.current) {
            flushSync(() => {
              setHeadEnded(true);
              setNegativeSpace((val) => val - prependSpace);
              if (needScrollCorrection) {
                setCurrentOffset(0);
              }
            });
          } else {
            const old = rootEl.scrollTop;
            flushSync(() => {
              setHeadEnded(true);
              if (needScrollCorrection) {
                setCurrentOffset(0);
              }
            });
            // overscroll
            rootEl.scrollTop = old - prependSpace;
          }
        }
        return;
      }
      const heightSum = entries
        .map((e) => e[1].initialHeight)
        .reduce((p, v) => p + v, 0);
      flushSync(() => {
        if (position === "prev") {
          setDataStates((d) => [
            ...entries.map((e) => ({
              index: e[1].index,
              el: e[0],
              size: e[1].initialHeight,
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
              size: e[1].initialHeight,
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

        setMinMaxLiveViewport(heightSum + preloadRange);
      });

      onProgressEvent(currentBaseRef.current, currentOffsetRef.current);

      if (position === "next" && isInitialInsert) {
        // we may have a wrong scroll if append space is 0
        // so we force set here

        flushSync(() => {});
        rootEl.scrollTop = prependSpace;
      }
      // debugger
      if (position === "prev") {
        if (hasInteractionRef.current) {
          flushSync(() => {
            setNegativeSpace((val) => val + heightSum);
          });
        } else {
          const old = rootEl.scrollTop;
          // rootEl.style.overflow = "hidden";
          rootEl.scrollTop = old + heightSum;
          // rootEl.style.overflow = "auto";
        }
      }
    },
    [
      currentBaseRef,
      currentOffsetRef,
      dataStateRef,
      footEndedRef,
      hasInteractionRef,
      headEndedRef,
      heightRef,
      onProgressEvent,
      preloadRange,
      prependSpace,
      setCurrentBase,
      setCurrentOffset,
      setDataStates,
      setFootEnded,
      setHeadEnded,
      setNegativeSpace,
    ]
  );

  // calculate whether we need to fetch more

  let currentScroll = 0;

  let itemIndex: number = -1;
  for (let i = 0; i < dataStates.length; i++) {
    if (currentBase === dataStates[i].index) {
      currentScroll += currentOffset;
      itemIndex = i;
      break;
    } else {
      currentScroll += getHeight(dataStates[i]);
    }
  }

  const fetchNext =
    !footEnded &&
    (dataStates.length === 0 ||
      currentScroll + height >= heightSum - preloadRange);
  const fetchPrev = !headEnded && !fetchNext && currentScroll < preloadRange;

  const trimPrev = !(fetchNext || fetchPrev) && currentScroll > maxLiveViewport;
  const trimNext =
    !(trimPrev || fetchNext || fetchPrev) &&
    heightSum - currentScroll - height > maxLiveViewport;

  const trimItemIndex = trimPrev || trimNext ? itemIndex : 0;
  const trimOffset = trimPrev || trimNext ? currentOffset : 0;
  const trimHasInteraction = trimPrev || trimNext ? hasInteraction : false;

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
          return [...entries.slice(0), [el, index]];
        }
      } else {
        return entries.filter((i) => i[1] !== index);
      }
    });
  }, []);

  const createFactory = useCallback(
    (direction: "next" | "prev", boundaryIndex: number): EntryFactory =>
      (index: number, size: number) => {
        if (direction === "next") {
          return {
            resizeRef: (el) => resizeRef(el, boundaryIndex + index + 1),
            updateSize: (newHeight) =>
              onSizeUpdate(newHeight, boundaryIndex + index + 1),
            index: boundaryIndex + index + 1,
          };
        } else {
          return {
            resizeRef: (el) => resizeRef(el, boundaryIndex - size + index),
            updateSize: (newHeight) =>
              onSizeUpdate(newHeight, boundaryIndex - size + index),
            index: boundaryIndex - size + index,
          };
        }
      },
    [onSizeUpdate, resizeRef]
  );

  useEffect(() => {
    if (height === 0) {
      // not loaded yet
      return;
    }

    if (fetchNext) {
      const controller = new AbortController();
      const signal = controller.signal;
      const lastIndex = dataStates[dataStates.length - 1]?.index;
      const index = lastIndex != null ? lastIndex : -1;
      const p = onLoadMoreEvent(
        "next",
        createFactory("next", index),
        dataStates,
        signal
      );
      p.then((entries) => !signal.aborted && onInsert("next", entries));
      return () => {
        controller.abort();
      };
    } else if (fetchPrev) {
      const controller = new AbortController();
      const signal = controller.signal;
      const index = dataStates[0]?.index ?? 0;
      const p = onLoadMoreEvent(
        "prev",
        createFactory("prev", index),
        dataStates,
        signal
      );
      p.then((entries) => !signal.aborted && onInsert("prev", entries));
      return () => {
        controller.abort();
      };
    } else if (trimPrev) {
      const id = setTimeout(() => {
        let length = 0;
        let removeUntil = 0;

        for (let i = trimItemIndex; i >= 0; i--) {
          let newLength;
          if (i === trimItemIndex) {
            newLength = length + trimOffset;
          } else {
            newLength = length + getHeight(dataStates[i]);
          }
          if (newLength >= maxLiveViewport) {
            break;
          }
          removeUntil = i;
          length = newLength;
        }

        // we cannot remove everything
        if (removeUntil === dataStates.length) {
          removeUntil--;
        }

        let extraTrim = 0;

        if (headEnded) {
          extraTrim = -prependSpace;
        }

        const sumDiff = dataStates
          .slice(0, removeUntil)
          .map((i) => getHeight(i))
          .reduce((p, v) => p + v, 0);

        console.log(extraTrim, sumDiff);

        // remove element
        if (trimHasInteraction) {
          flushSync(() => {
            if (headEnded) {
              setHeadEnded(false);
            }
            setDataStates((ds) => ds.slice(removeUntil));
            setNegativeSpace((val) => val - (sumDiff + extraTrim));
          });
        } else {
          flushSync(() => {
            if (headEnded) {
              setHeadEnded(false);
            }
            setDataStates((ds) => ds.slice(removeUntil));
          });
          if (scrollerRef.current) {
            const old = scrollerRef.current.scrollTop;
            // rootEl.style.overflow = "hidden";
            scrollerRef.current.scrollTop = old - (sumDiff + extraTrim);
            // rootEl.style.overflow = "auto";
          }
        }
      });
      return () => {
        clearTimeout(id);
      };
    } else if (trimNext) {
      const id = setTimeout(() => {
        let length = 0;
        let removeAfter = 0;

        for (let i = trimItemIndex; i < dataStates.length - 1; i++) {
          let newLength;
          if (i === trimItemIndex) {
            newLength = getHeight(dataStates[i]) - trimOffset;
          } else {
            newLength = length + getHeight(dataStates[i]);
          }
          if (newLength >= maxLiveViewport) {
            break;
          }
          removeAfter = i;
          length = newLength;
        }

        // we cannot remove everything
        if (removeAfter === 0) {
          removeAfter = 1;
        }
        if (footEnded) {
          setFootEnded(false);
        }

        setDataStates((ds) => ds.slice(0, removeAfter));
      });
      return () => {
        clearTimeout(id);
      };
    }
  }, [
    dataStates,
    onInsert,
    fetchNext,
    fetchPrev,
    onLoadMoreEvent,
    onSizeUpdate,
    trimPrev,
    trimNext,
    trimHasInteraction,
    trimItemIndex,
    maxLiveViewport,
    trimOffset,
    setDataStates,
    setNegativeSpace,
    heightSum,
    resizeRef,
    headEnded,
    prependSpace,
    setHeadEnded,
    footEnded,
    setFootEnded,
    height,
    createFactory,
  ]);

  const elements = dataStates.map((s) => (
    <div key={s.index} style={{ height: `${getHeight(s)}px` }}>
      {s.el}
    </div>
  ));

  const onScroll: UIEventHandler<HTMLDivElement> = (ev) => {
    if (hasFocusedInteraction) {
      setHasInteractionBefore(Infinity);
    } else {
      setHasInteractionBefore(Date.now() + INTERACTION_CHANGE_DELAY);
    }

    if (dataStates.length === 0) {
      return;
    }

    let pos = ev.currentTarget.scrollTop;

    if (pos < 0) {
      ev.currentTarget.style.overflow = "hidden";
      ev.currentTarget.scrollTop = 0;
      ev.currentTarget.style.overflow = "auto";
      pos = 0;
    }

    // at pre-position
    if (pos < currentPrependSpace - negativeSpace) {
      const newBase = dataStates[0];
      if (newBase == null) return;
      const offset = pos - prependSpace;
      if (headEnded) {
        // force commit
        flushSync(() => {
          setNegativeSpace(0);
          setCurrentOffset(0);
          setCurrentBase(newBase.index);
        });
        ev.currentTarget.style.overflow = "hidden";
        ev.currentTarget.scrollTop = 0;
        ev.currentTarget.style.overflow = "auto";
        // FIXME: safari scroll workaround
        fixFreezingScrollBar(ev.currentTarget, 0);
        onProgressEvent(newBase.index, 0);
        return;
      }
      setCurrentOffset(offset);
      setCurrentBase(newBase.index);
      onProgressEvent(newBase.index, offset);
      // console.log(offset);
      // console.log(newBase.index);
      return;
    }
    // in list
    let offset = currentPrependSpace - negativeSpace;
    for (const item of dataStates) {
      const height = getHeight(item);
      if (offset + height > pos) {
        setCurrentOffset(pos - offset);
        setCurrentBase(item.index);
        onProgressEvent(item.index, pos - offset);
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
    onProgressEvent(item.index, pos - offset + getHeight(item));
    // console.log(pos - offset + getHeight(item));
    // console.log(item.index);
  };

  const onTouchMove: TouchEventHandler<HTMLDivElement> = (ev) => {
    const baseY = ev.currentTarget.getBoundingClientRect().top;
    lastInteractPosition.current = ev.changedTouches[0].clientY - baseY;
  };
  const onTouchStart: TouchEventHandler<HTMLDivElement> = (ev) => {
    // console.log(ev)
    setHasFocusedInteraction(true);
    setHasInteractionBefore(Infinity);
    const baseY = ev.currentTarget.getBoundingClientRect().top;
    lastInteractPosition.current = ev.changedTouches[0].clientY - baseY;
  };
  const onTouchEnd: TouchEventHandler<HTMLDivElement> = (ev) => {
    // console.log(ev)
    stopInteractionShortly(ev);
    const baseY = ev.currentTarget.getBoundingClientRect().top;
    lastInteractPosition.current = ev.changedTouches[0].clientY - baseY;
  };

  const stopInteractionShortly: TouchEventHandler<HTMLDivElement> = () => {
    // console.log(ev)
    setHasFocusedInteraction(false);
    setHasInteractionBefore(Date.now() + INTERACTION_CHANGE_DELAY);
  };

  return (
    <div
      {...props}
      ref={onRefed}
      style={style}
      className={"dyn root" + (className ? `  ${className}` : "")}
      onScroll={onScroll}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="spacing"
        style={{
          height: `${currentPrependSpace}px`,
          background: prependContent ? 'white' : 'transparent',
          zIndex: prependContent ? '1' : '-1',
        }}
      >
        {prependContent}
      </div>
      <div style={{ marginTop: `${-negativeSpace}px` }} />
      {elements}
      <div
        className="spacing"
        style={{
          height: `${currentAppendSpace}px`,
          background: appendContent ? 'white' : 'transparent',
          zIndex: appendContent ? '1' : '-1',
        }}
      >
        {appendContent}
      </div>
    </div>
  );
};
