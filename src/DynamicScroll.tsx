/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  CSSProperties,
  ReactElement,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import "./DynamicScroll.css";
import { END_OF_STREAM, getHeight, useEvent, useObserveElements } from "./DynamicScrollUtils";

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

export interface DynamicChildElementProps { }

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
  (current: DataEntry<Data>, offset: number, dataList: DataEntry<Data>[], signal: AbortSignal): void;
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

const TOLERANCE = 3

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function fixFreezingScrollBar(el: HTMLElement, scrollPos: number) {
  el.scrollTop = scrollPos + 1;
  el.scrollTo({ top: scrollPos });
}

interface RawDynamicScrollProps<Data extends DataBase> {
  initialHeadLocked?: boolean;
  initialFootLocked?: boolean
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
  direction?: 'x' | 'y'
}

type DivProps = React.HTMLAttributes<HTMLDivElement>;

type DynamicScrollProps<Data extends DataBase> = Omit<
  DivProps,
  keyof RawDynamicScrollProps<Data>
> &
  RawDynamicScrollProps<Data>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

interface DynamicScrollContext<T extends DataBase> {
  dataStates: DataEntry<T>[],
  prependSpace: number,
  appendSpace: number,
  // this absolute minimum range to keep loaded or it cause the system to unload itself
  minMaxLiveViewportPrev: number
  minMaxLiveViewportNext: number
}

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-constraint
export const DynamicScroll = <T extends DataBase>({
  initialHeadLocked = false,
  initialFootLocked = false,
  prependSpace = 0,
  appendSpace = 0,
  maxLiveViewport: maxLiveViewportProp = 3000,
  preloadRange = 1000,
  onLoadMore,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onProgress = () => { },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  prependContent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  appendContent,
  className,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onSelectAnchor,
  style,
  direction = 'y',
  ...props
}: DynamicScrollProps<T>) => {
  // this is only used in event to check if screen size is changed,
  // so we don't use state to store it
  const screenHeight = useRef(-1)

  const [headFixed, setHeadFixed] = useState(initialHeadLocked);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [footFixed, setFootFixed] = useState(initialFootLocked);

  // const [currentPrependSpace, setPrependSpace, prependSpaceRef] = useRefState(initialHeadLocked ? 0 : prependSpace);
  // const [currentAppendSpace, setAppendSpace, appendSpaceRef] = useRefState(appendSpace);

  const elementRef = useRef<HTMLDivElement>(null);

  const isScrolling = useRef(false)

  const [dynamicScrollContext, setDynamicScrollContext] = useState<DynamicScrollContext<T>>(() => ({
    dataStates: [],
    // recalculation of minMaxLiveViewport relies on this
    screenHeight: -1,
    // this is altered when insert new items/resize
    minMaxLiveViewportPrev: 0,
    minMaxLiveViewportNext: 0,
    // this is altered when insert/remove new items/resize
    prependSpace: initialHeadLocked ? 0 : prependSpace,
    // this is altered when insert/remove new items/resize
    appendSpace: appendSpace,
  }))

  const maxLiveViewportPrev = Math.max(maxLiveViewportProp, dynamicScrollContext.minMaxLiveViewportPrev);
  const maxLiveViewportNext = Math.max(maxLiveViewportProp, dynamicScrollContext.minMaxLiveViewportNext);

  const itemSizeSum = dynamicScrollContext.dataStates.reduce((p, c) => p + c.size, 0);

  const stageSize = dynamicScrollContext.prependSpace + itemSizeSum + dynamicScrollContext.appendSpace

  const stageStyle = useMemo((): CSSProperties => {
    return direction === 'y' ? {
      height: stageSize + 'px'
    } : {
      width: stageSize + 'px'
    }
  }, [direction, stageSize])

  const onSizeUpdate = useEvent((newSize: number) => {
    if (screenHeight.current === -1) {
      // perform initial setup
      const newContainerOffset = prependSpace
      const el = elementRef.current!
      screenHeight.current = newSize

      if (direction === 'x') {
        el.scrollLeft = newContainerOffset
      } else {
        el.scrollTop = newContainerOffset
      }

      // trigger initial load
      performCheck()
    } else if (screenHeight.current !== newSize) {
      // TODO: perform size change handling
      screenHeight.current = newSize
    }
  })

  useEffect(() => {
    if (elementRef.current) {
      const el = elementRef.current
      const cb: ResizeObserverCallback = () => {
        const size = el.getBoundingClientRect()
        if (direction === 'y') {
          onSizeUpdate(size.height)
        } else {
          onSizeUpdate(size.width)
        }
      }
      const observer = new ResizeObserver(cb)
      observer.observe(el)
      return () => {
        observer.disconnect()
      }
    }
  }, [direction, elementRef, onSizeUpdate])

  type Job = {
    action: 'loadPrev' | 'loadNext',
    index: number,
    controller: AbortController
  }

  type Task = {
    action: 'prepend';
    items: DataEntry<T>[]
  } | {
    action: 'append';
    items: DataEntry<T>[]
  } | {
    action: 'unloadPrev';
    count: number
  } | {
    action: 'unloadNext';
    count: number
  } | {
    action: 'patch';
    items: Pick<DataEntry<T>, 'index' | 'data' | 'size'>[]
  } | {
    action: 'forcedResync';
  }

  const pendingJob = useRef<Job[]>([])
  const taskList = useRef<Task[]>([])

  function appendJob(task: Job) {
    pendingJob.current = [...pendingJob.current, task]
  }
  function appendTask(task: Task) {
    taskList.current = [...taskList.current, task]
  }
  function removeTaskOfType(type: Task['action']) {
    taskList.current = taskList.current.filter(i => i.action !== type)
  }
  function removeJobOfType(type: Job['action']) {
    const toCancel = pendingJob.current.filter(i => i.action === type)
    pendingJob.current = pendingJob.current.filter(i => i.action !== type)
    for (const cancelled of toCancel) {
      cancelled.controller.abort()
    }
  }

  const applyChanges = useEvent(() => {
    const el = elementRef.current
    if (!el) return
    if (taskList.current.length === 0) return

    const currentContext = dynamicScrollContext
    const currentScroll = direction === 'y' ? el.scrollTop : el.scrollLeft
    const currentSize = direction === 'y' ? el.offsetHeight : el.offsetWidth

    const tasks = taskList.current
    taskList.current = []

    let newDataStates = currentContext.dataStates
    let newPrependSpace = currentContext.prependSpace
    let newAppendSpace = currentContext.appendSpace

    const sortedTask = tasks.slice(0).sort((i, j) => (i.action === 'patch' ? 1 : 0) - (j.action === 'patch' ? 1 : 0))

    let tweakUnloadDistPrev: 'grow' | 'reset' | null = null
    let tweakUnloadDistNext: 'grow' | 'reset' | null = null

    for (const task of sortedTask) {
      console.log('execute', task, newDataStates)
      const indexPrev = newDataStates.length > 0 ? newDataStates[0].index : 0
      const indexNext = newDataStates.length > 0 ? newDataStates[newDataStates.length - 1].index : -1
      switch (task.action) {
        case 'prepend': {
          if (task.items[task.items.length - 1].index !== indexPrev - 1) {
            // bad id
            console.warn('bad prepend', task)
            break
          }
          tweakUnloadDistPrev = 'grow'
          newDataStates = [...task.items, ...newDataStates]
          const heightSum = task.items.reduce((p, c) => p + c.size, 0)
          newPrependSpace -= heightSum
          break
        }
        case 'append': {
          if (task.items[0].index !== indexNext + 1) {
            // bad id
            console.warn('bad append', task)
            break
          }
          tweakUnloadDistNext = 'grow'
          newDataStates = [...newDataStates, ...task.items]
          const heightSum = task.items.reduce((p, c) => p + c.size, 0)
          newAppendSpace -= heightSum
          break
        }
        case 'unloadPrev': {
          tweakUnloadDistPrev = 'reset'
          const toUnload = Math.min(newDataStates.length - 1, task.count)
          const unloadedItems = newDataStates.slice(0, toUnload)
          const heightSum = unloadedItems.reduce((p, c) => p + c.size, 0)
          console.log('removeHeight prev', heightSum)
          newDataStates = newDataStates.slice(toUnload, newDataStates.length)
          newPrependSpace += heightSum
          break
        }
        case 'unloadNext': {
          tweakUnloadDistNext = 'reset'
          const toUnload = Math.min(newDataStates.length - 1, task.count)
          const unloadedItems = newDataStates.slice(newDataStates.length - toUnload, newDataStates.length)
          const heightSum = unloadedItems.reduce((p, c) => p + c.size, 0)
          console.log('removeHeight next', heightSum)
          newDataStates = newDataStates.slice(0, newDataStates.length - toUnload)
          newAppendSpace += heightSum
          break
        }
        case 'patch': {
          tweakUnloadDistPrev = 'grow'
          tweakUnloadDistNext = 'grow'
          const initialIndexAndOffset = getIndexAndOffsetWithDistance(newDataStates, currentScroll - newPrependSpace)

          const newItems = newDataStates.map(i => {
            const patch = task.items.find(j => j.index === i.index)
            if (patch) {
              return {
                ...i,
                ...patch
              }
            }
            return i
          })

          const newPosition = newPrependSpace + getDistanceWithIndexAndOffset(newItems, initialIndexAndOffset[0], initialIndexAndOffset[1])

          newPrependSpace -= (newPosition - currentScroll)
        }
      }
    }

    const heightSum = newDataStates.reduce((p, c) => p + c.size, 0)

    const distanceToHead = currentScroll - newPrependSpace
    const distanceToEnd = newPrependSpace + heightSum - (currentScroll + currentSize)
    console.log(distanceToEnd)

    const minMaxUnloadDistancePrev = tweakUnloadDistPrev ? (tweakUnloadDistPrev === 'grow' ? distanceToHead : 0) : dynamicScrollContext.minMaxLiveViewportPrev
    const minMaxUnloadDistanceNext = tweakUnloadDistNext ? (tweakUnloadDistNext === 'grow' ? distanceToEnd : 0) : dynamicScrollContext.minMaxLiveViewportNext

    if (isScrolling.current || headFixed) {
      flushSync(() => {
        setDynamicScrollContext({
          dataStates: newDataStates,
          prependSpace: newPrependSpace,
          appendSpace: footFixed ? appendSpace : newAppendSpace,
          minMaxLiveViewportPrev: minMaxUnloadDistancePrev,
          minMaxLiveViewportNext: minMaxUnloadDistanceNext,
        })
      })
    } else {
      // if we have more space, we shrink it and reduce scroll to match it

      const scrollOffset = -(newPrependSpace - prependSpace)
      flushSync(() => {
        setDynamicScrollContext({
          dataStates: newDataStates,
          prependSpace: prependSpace,
          appendSpace: footFixed ? appendSpace : newAppendSpace,
          minMaxLiveViewportPrev: minMaxUnloadDistancePrev,
          minMaxLiveViewportNext: minMaxUnloadDistanceNext,
        })
      })

      if (scrollOffset != 0) {
        console.log('scroll offset', scrollOffset)
        if (direction === 'x') {
          el.scrollLeft += scrollOffset
        } else {
          el.scrollTop += scrollOffset
        }
      }
    }
  })

  useEffect(() => {
    let id: ReturnType<typeof requestAnimationFrame>
    function tick() {
      applyChanges()
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(id)
    }
  }, [applyChanges])

  const onItemSizeUpdate = (height: number, index: number) => {
    const item = dynamicScrollContext.dataStates.find(i => i.index === index)
    if (item) {
      appendTask({
        action: 'patch',
        items: [
          {
            index,
            data: item.data,
            size: height,
          }
        ]
      })
    }
  }

  const resizeRef = useObserveElements(onItemSizeUpdate)

  const createFactory = (direction: "next" | "prev", boundaryIndex: number): EntryFactory =>
    (index: number, size: number) => {
      if (direction === "next") {
        return {
          resizeRef: (el) => resizeRef(el, boundaryIndex + index + 1),
          updateSize: (newHeight) =>
            onItemSizeUpdate(newHeight, boundaryIndex + index + 1),
          index: boundaryIndex + index + 1,
        };
      } else {
        return {
          resizeRef: (el) => resizeRef(el, boundaryIndex - size + index),
          updateSize: (newHeight) =>
            onItemSizeUpdate(newHeight, boundaryIndex - size + index),
          index: boundaryIndex - size + index,
        };
      }
    }

  const performCheck = () => {
    const el = elementRef.current
    if (!el) return

    const currentContext = dynamicScrollContext
    const currentScroll = direction === 'y' ? el.scrollTop : el.scrollLeft
    const currentSize = direction === 'y' ? el.offsetHeight : el.offsetWidth
    const heightSum = currentContext.dataStates.reduce((p, c) => p + c.size, 0)

    const distanceToHead = currentScroll - currentContext.prependSpace
    const distanceToEnd = currentContext.prependSpace + heightSum - (currentScroll + currentSize)

    const indexPrev = currentContext.dataStates.length > 0 ? currentContext.dataStates[0].index : 0
    const indexNext = currentContext.dataStates.length > 0 ? currentContext.dataStates[currentContext.dataStates.length - 1].index : -1

    if (distanceToHead < preloadRange) {
      if (
        pendingJob.current.find(i => i.action === 'loadPrev' && i.index === indexPrev) == null
        && taskList.current.find(i => i.action === 'prepend') == null
      ) {
        removeJobOfType('loadPrev')
        removeTaskOfType('prepend')
        removeTaskOfType('unloadPrev')
        const controller = new AbortController()
        onLoadMore('prev', createFactory('prev', indexPrev), currentContext.dataStates, controller.signal)
          .then(res => {
            removeJobOfType('loadPrev')
            if (res === END_OF_STREAM) {
              setHeadFixed(true)
            } else {
              appendTask({
                action: 'prepend',
                items: res.map(item => ({
                  el: item[0],
                  data: item[1],
                  index: item[1].index,
                  size: item[1].initialHeight
                }))
              })
            }
          }, (err: unknown) => {
            if (controller.signal.aborted) return
            console.error(err)
          })
        appendJob({
          action: 'loadPrev',
          index: indexPrev,
          controller
        })
      }
    }
    if (distanceToEnd < preloadRange) {
      if (
        pendingJob.current.find(i => i.action === 'loadNext' && i.index === indexNext) == null
        && taskList.current.find(i => i.action === 'append') == null
      ) {
        removeJobOfType('loadNext')
        removeTaskOfType('append')
        removeTaskOfType('unloadNext')
        const controller = new AbortController()
        onLoadMore('next', createFactory('next', indexNext), currentContext.dataStates, controller.signal)
          .then(res => {
            removeJobOfType('loadNext')
            if (res === END_OF_STREAM) {
              setHeadFixed(true)
            } else {
              appendTask({
                action: 'append',
                items: res.map(item => ({
                  el: item[0],
                  data: item[1],
                  index: item[1].index,
                  size: item[1].initialHeight
                }))
              })
            }
          }, (err: unknown) => {
            if (controller.signal.aborted) return
            console.error(err)
          })
        appendJob({
          action: 'loadNext',
          index: indexNext,
          controller
        })
      }
    }

    if (distanceToHead > maxLiveViewportPrev) {
      const toUnloadDist = distanceToHead - maxLiveViewportPrev
      let sum = 0
      let count = 0
      for (let i = 0; i < currentContext.dataStates.length; i++) {
        sum += currentContext.dataStates[i].size
        count++
        if (sum >= toUnloadDist) {
          break
        }
      }
      appendTask({
        'action': 'unloadPrev',
        count
      })
    }
    if (distanceToEnd > maxLiveViewportNext) {
      const toUnloadDist = distanceToEnd - maxLiveViewportNext
      let sum = 0
      let count = 0
      for (let i = currentContext.dataStates.length - 1; i >= 0; i--) {
        sum += currentContext.dataStates[i].size
        console.log(sum)
        count++
        if (sum >= toUnloadDist) {
          break
        }
      }
      appendTask({
        'action': 'unloadNext',
        count
      })
    }
  }

  const elements = useMemo(() => {
    return dynamicScrollContext.dataStates.map((i) => {
      return <i.el.type {...i.el.props} key={i.index} style={direction === 'y' ? {
        height: i.size + 'px'
      } : {
        width: i.size + 'px'
      }} />
    })
  }, [dynamicScrollContext.dataStates, direction])

  return (
    <div
      {...props}
      ref={elementRef}
      style={style}
      className={"dyn root" + (className ? `  ${className}` : "")}
      onScroll={performCheck}
    // onTouchStart={onTouchStart}
    // onTouchMove={onTouchMove}
    // onTouchEnd={onTouchEnd}
    >
      <div style={stageStyle}>

      </div>
      <div
        className={`container-${direction}`}
        style={direction === 'y'
          ? { transform: `translateY(${dynamicScrollContext.prependSpace}px)` }
          : { transform: `translateX(${dynamicScrollContext.prependSpace}px)` }
        }>
        {elements}
      </div>
    </div>
  );
};
