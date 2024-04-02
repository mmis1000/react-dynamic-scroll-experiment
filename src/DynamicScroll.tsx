import {
  CSSProperties,
  ReactElement,
  ReactNode,
  TouchEventHandler,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import './DynamicScroll.css'
import {
  END_OF_STREAM,
  getHeight,
  useEvent,
  useObserveElements,
  useScrollingEvent,
} from './DynamicScrollUtils'

export interface DataBase {
  index: number
  initialHeight: number
}

export interface DataEntry<T extends DataBase> {
  index: number
  el: ReactElement<DynamicChildElementProps>
  size: number
  data: T
}

export interface DynamicChildElementProps {}

export interface EntryFactory {
  (index: number, size: number): {
    resizeRef: (el: HTMLElement | null) => void
    updateSize: (newHeight: number) => void
    index: number
  }
}

export interface LoadHandler<Data extends DataBase> {
  (
    direction: 'next' | 'prev',
    factory: EntryFactory,
    datas: DataEntry<Data>[],
    signal: AbortSignal
  ): Promise<
    [ReactElement<DynamicChildElementProps>, Data][] | typeof END_OF_STREAM
  >
}

export interface ProgressHandler<Data extends DataBase> {
  (
    current: DataEntry<Data> | undefined,
    offset: number,
    dataList: DataEntry<Data>[]
  ): void
}

export interface AnchorSelector<Data extends DataBase> {
  (
    entries: DataEntry<Data>[],
    // start point of content in the container
    contentOffset: number,
    // scroll position of container
    scroll: number,
    // size of container
    containerSize: number,
    // touch position on the screen (screen position)
    lastTouchPosition: number
  ): [index: number, offset: number]
}

const anchorStrategyTouch: AnchorSelector<DataBase> = (
  entries,
  contentOffset,
  scroll,
  _containerSize,
  lastTouchPosition
) => {
  const distance = scroll - contentOffset + lastTouchPosition

  if (entries.length === 0) {
    return [0, distance]
  }

  if (distance < 0) {
    return [entries[0]!.index, distance]
  }

  let currentOffset = distance

  for (let i = 0; i < entries.length; i++) {
    const height = getHeight(entries[i])
    // FIXME: workaround subpixel scroll
    if (currentOffset < height - 1) {
      return [entries[i]!.index, currentOffset]
    }
    currentOffset -= height
  }

  const lastHeight = getHeight(entries[entries.length - 1])
  const res = [
    entries[entries.length - 1]!.index,
    currentOffset + lastHeight - lastTouchPosition,
  ] satisfies [number, number]
  // console.log(res, anchorStrategyDefault(entries, contentOffset, scroll, _containerSize, lastTouchPosition))
  return res
}

const anchorStrategyDefault: AnchorSelector<DataBase> = (
  entries,
  contentOffset,
  scroll,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _containerSize,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _lastTouchPosition
) => getIndexAndOffsetWithDistance(entries, scroll - contentOffset)

const REQUIRE_SAFARI_WORKAROUND =
  !/Edg\//.test(navigator.userAgent) &&
  !/Chrome\//.test(navigator.userAgent) &&
  /safari/i.test(navigator.userAgent)

const SCROLL_RESET_THRESHOLD = 50

function fixFreezingScrollBar(
  el: HTMLElement,
  direction: 'x' | 'y',
  scrollPos: number
) {
  if (direction === 'x') {
    el.scrollLeft = scrollPos + 1
    el.scrollTo({ left: scrollPos })
  } else {
    el.scrollTop = scrollPos + 1
    el.scrollTo({ top: scrollPos })
  }
}

interface RawDynamicScrollProps<Data extends DataBase> {
  initialHeadLocked?: boolean
  initialFootLocked?: boolean
  initialPrependSpace?: number
  initialAppendSpace?: number
  initialOffset?: number

  prependSpace?: number
  appendSpace?: number
  preloadRange?: number
  /** Default unload range.
   * May be bumped if more content than expect loaded at once.
   * Because it would unload content after loaded instantly otherwise.
   */
  maxLiveViewport?: number
  onLoadMore: LoadHandler<Data>
  onProgress?: ProgressHandler<Data>
  className?: string
  style?: CSSProperties
  prependContent?: ReactNode
  appendContent?: ReactNode
  onSelectAnchor?: 'default' | 'touch' | AnchorSelector<Data>
  direction?: 'x' | 'y'
}

type DivProps = React.HTMLAttributes<HTMLDivElement>

type DynamicScrollProps<Data extends DataBase> = Omit<
  DivProps,
  keyof RawDynamicScrollProps<Data>
> &
  RawDynamicScrollProps<Data>

const getIndexAndOffsetWithDistance = (
  entries: DataEntry<DataBase>[],
  distance: number
): [index: number, offset: number] => {
  if (entries.length === 0) {
    // console.log([0, distance]);
    return [0, distance]
  }

  if (distance < 0) {
    return [entries[0]!.index, distance]
  }

  let currentOffset = distance

  for (let i = 0; i < entries.length; i++) {
    const height = getHeight(entries[i])
    // FIXME: workaround subpixel scroll
    if (currentOffset <= height - 1) {
      // console.log([entries[i]!.index, currentOffset, height]);
      return [entries[i]!.index, currentOffset]
    }
    currentOffset -= height
  }

  const lastHeight = getHeight(entries[entries.length - 1])

  // console.log([entries[entries.length - 1]!.index, currentOffset + lastHeight]);
  return [entries[entries.length - 1]!.index, currentOffset + lastHeight]
}

const getDistanceWithIndexAndOffset = (
  entries: DataEntry<DataBase>[],
  index: number,
  offset: number
): number => {
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
  // it can happen if the scroll started at end with 0 items already appended
  return 0
  // throw new Error('invalid index ' + index)
}

interface DynamicScrollContext<T extends DataBase> {
  startIndex: number
  dataStates: DataEntry<T>[]
  prependSpace: number
  appendSpace: number
  // this absolute minimum range to keep loaded or it cause the system to unload itself
  minMaxLiveViewportPrev: number
  minMaxLiveViewportNext: number
}

export const DynamicScroll = <T extends DataBase>({
  initialHeadLocked = false,
  initialFootLocked = false,
  initialPrependSpace,
  initialAppendSpace,
  initialOffset,
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
  direction = 'y',
  ...props
}: DynamicScrollProps<T>) => {
  // this is only used in event to check if screen size is changed,
  // so we don't use state to store it
  const screenHeight = useRef(-1)

  const lastTouchPosition = useRef(0)

  const [headFixed, setHeadFixed] = useState(initialHeadLocked)
  const [footFixed, setFootFixed] = useState(initialFootLocked)

  // const [currentPrependSpace, setPrependSpace, prependSpaceRef] = useRefState(initialHeadLocked ? 0 : prependSpace);
  // const [currentAppendSpace, setAppendSpace, appendSpaceRef] = useRefState(appendSpace);

  const elementRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const isScrolling = useRef(false)

  const [dynamicScrollContext, setDynamicScrollContext] = useState<
    DynamicScrollContext<T>
  >(() => ({
    startIndex: 0,
    dataStates: [],
    // recalculation of minMaxLiveViewport relies on this
    screenHeight: -1,
    // this is altered when insert new items/resize
    minMaxLiveViewportPrev: 0,
    minMaxLiveViewportNext: 0,
    // this is altered when insert/remove new items/resize
    prependSpace: initialHeadLocked
      ? initialPrependSpace ?? 0
      : initialPrependSpace ?? prependSpace,
    // this is altered when insert/remove new items/resize
    appendSpace: initialFootLocked
      ? initialAppendSpace ?? 0
      : initialAppendSpace ?? appendSpace,
  }))

  console.log(dynamicScrollContext.prependSpace)

  const maxLiveViewportPrev = Math.max(
    maxLiveViewportProp,
    dynamicScrollContext.minMaxLiveViewportPrev
  )
  const maxLiveViewportNext = Math.max(
    maxLiveViewportProp,
    dynamicScrollContext.minMaxLiveViewportNext
  )

  const itemSizeSum = dynamicScrollContext.dataStates.reduce(
    (p, c) => p + c.size,
    0
  )

  const stageSize =
    dynamicScrollContext.prependSpace +
    itemSizeSum +
    dynamicScrollContext.appendSpace

  const stageStyle = useMemo((): CSSProperties => {
    return {
      ...(direction === 'y'
        ? {
            height: stageSize + 'px',
          }
        : {
            width: stageSize + 'px',
          }),
      ...((prependSpace > 0 || appendSpace > 0) && !footFixed
        ? {
            minHeight: `calc(100% + ${stageSize}px`,
          }
        : {}),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appendSpace > 0, direction, prependSpace > 0, stageSize])

  const selectAnchor = useEvent(
    (
      entries: DataEntry<T>[],
      // start point of content in the container
      contentOffset: number,
      // scroll position of container
      scroll: number,
      // size of container
      containerSize: number,
      // touch position on the screen (screen position)
      lastTouchPosition: number
    ) => {
      return onSelectAnchor == null || onSelectAnchor == 'default'
        ? anchorStrategyDefault(
            entries,
            contentOffset,
            scroll,
            containerSize,
            lastTouchPosition
          )
        : onSelectAnchor === 'touch'
        ? anchorStrategyTouch(
            entries,
            contentOffset,
            scroll,
            containerSize,
            lastTouchPosition
          )
        : onSelectAnchor(
            entries,
            contentOffset,
            scroll,
            containerSize,
            lastTouchPosition
          )
    }
  )

  const onSizeUpdate = useEvent((newSize: number) => {
    if (screenHeight.current === -1) {
      // perform initial setup
      const newContainerOffset = initialPrependSpace ?? prependSpace
      const el = elementRef.current!
      screenHeight.current = newSize

      // console.log('initial scroll to', newContainerOffset)
      if (direction === 'x') {
        el.scrollLeft = newContainerOffset + (initialOffset ?? 0)
      } else {
        el.scrollTop = newContainerOffset + (initialOffset ?? 0)
      }

      // trigger initial load
      onScrollEvent()
    } else if (screenHeight.current !== newSize) {
      screenHeight.current = newSize
      onScrollEvent()
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
    action: 'loadPrev' | 'loadNext'
    index: number
    controller: AbortController
  }

  type Task =
    | {
        action: 'prepend'
        items: DataEntry<T>[]
      }
    | {
        action: 'append'
        items: DataEntry<T>[]
      }
    | {
        action: 'unloadPrev'
        count: number
      }
    | {
        action: 'unloadNext'
        count: number
      }
    | {
        action: 'patch'
        items: Pick<DataEntry<T>, 'index' | 'data' | 'size'>[]
      }
    | {
        action: 'fixHead'
      }
    | {
        action: 'fixFoot'
      }
    | {
        action: 'resync'
      }
    | {
        // resync with forced scroll position patch
        action: 'forceSync'
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
    taskList.current = taskList.current.filter((i) => i.action !== type)
  }
  function removeJobOfType(type: Job['action']) {
    const toCancel = pendingJob.current.filter((i) => i.action === type)
    pendingJob.current = pendingJob.current.filter((i) => i.action !== type)
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

    let newStartIndex = currentContext.startIndex
    let newDataStates = currentContext.dataStates
    let newPrependSpace = currentContext.prependSpace
    let newAppendSpace = currentContext.appendSpace

    const nonPatchTasks = tasks.filter((i) => i.action !== 'patch')
    const patchTasks = tasks.filter(function <T extends { action: string }>(
      i: T
    ): i is T & { action: 'patch' } {
      return i.action === 'patch'
    })
    const sortedNonPatchTask = nonPatchTasks
      .slice(0)
      .sort(
        (i, j) =>
          (i.action === 'patch' ? 1 : 0) - (j.action === 'patch' ? 1 : 0)
      )

    let tweakUnloadDistPrev: 'grow' | 'reset' | null = null
    let tweakUnloadDistNext: 'grow' | 'reset' | null = null

    // if (tasks.length > 0) {
    //   console.log(tasks)
    // }

    for (const task of sortedNonPatchTask) {
      // console.log('execute', task, newDataStates)
      const indexPrev = newStartIndex
      const indexNext = newStartIndex + newDataStates.length - 1

      switch (task.action) {
        case 'prepend': {
          if (task.items[task.items.length - 1].index !== indexPrev - 1) {
            // bad id
            console.warn('bad prepend', task)
            break
          }
          tweakUnloadDistPrev = 'grow'
          newStartIndex -= task.items.length
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
          const toUnload = Math.min(newDataStates.length, task.count)
          const unloadedItems = newDataStates.slice(0, toUnload)
          const heightSum = unloadedItems.reduce((p, c) => p + c.size, 0)
          // console.log('removeHeight prev', heightSum)
          newStartIndex += toUnload
          newDataStates = newDataStates.slice(toUnload, newDataStates.length)
          newPrependSpace += heightSum
          break
        }
        case 'unloadNext': {
          tweakUnloadDistNext = 'reset'
          const toUnload = Math.min(newDataStates.length, task.count)
          const unloadedItems = newDataStates.slice(
            newDataStates.length - toUnload,
            newDataStates.length
          )
          const heightSum = unloadedItems.reduce((p, c) => p + c.size, 0)
          // console.log('removeHeight next', heightSum)
          newDataStates = newDataStates.slice(
            0,
            newDataStates.length - toUnload
          )
          newAppendSpace += heightSum
          break
        }
      }
    }

    if (patchTasks.length > 0) {
      tweakUnloadDistPrev = 'grow'
      tweakUnloadDistNext = 'grow'

      const initialIndexAndOffset = selectAnchor(
        newDataStates,
        newPrependSpace,
        currentScroll,
        currentSize,
        lastTouchPosition.current
      )
      const initialPosition =
        newPrependSpace +
        getDistanceWithIndexAndOffset(
          newDataStates,
          initialIndexAndOffset[0],
          initialIndexAndOffset[1]
        )

      for (const task of patchTasks) {
        const newItems = newDataStates.map((i) => {
          const patch = task.items.find((j) => j.index === i.index)
          if (patch) {
            return {
              ...i,
              ...patch,
            }
          }
          return i
        })
        newDataStates = newItems
      }

      const newPosition =
        newPrependSpace +
        getDistanceWithIndexAndOffset(
          newDataStates,
          initialIndexAndOffset[0],
          initialIndexAndOffset[1]
        )
      newPrependSpace -= newPosition - initialPosition
      // console.log('patch finished with offset ', (newPosition - initialPosition), ' and ', patchTasks.length, ' tasks')
    }

    const heightSum = newDataStates.reduce((p, c) => p + c.size, 0)

    const distanceToHead = currentScroll - newPrependSpace
    const distanceToEnd =
      newPrependSpace + heightSum - (currentScroll + currentSize)

    const minMaxUnloadDistancePrev = tweakUnloadDistPrev
      ? tweakUnloadDistPrev === 'grow'
        ? distanceToHead
        : 0
      : dynamicScrollContext.minMaxLiveViewportPrev
    const minMaxUnloadDistanceNext = tweakUnloadDistNext
      ? tweakUnloadDistNext === 'grow'
        ? distanceToEnd
        : 0
      : dynamicScrollContext.minMaxLiveViewportNext

    const fixHead =
      sortedNonPatchTask.find((i) => i.action === 'fixHead') != null
    const fixFoot =
      sortedNonPatchTask.find((i) => i.action === 'fixFoot') != null

    const forcedScrollSync =
      fixHead ||
      sortedNonPatchTask.find((i) => i.action === 'forceSync') != null

    if (isScrolling.current && REQUIRE_SAFARI_WORKAROUND && !forcedScrollSync) {
      // flushSync(() => {
      if (fixFoot) setFootFixed(true)
      setDynamicScrollContext({
        startIndex: newStartIndex,
        dataStates: newDataStates,
        prependSpace: newPrependSpace,
        appendSpace: fixFoot ? 0 : footFixed ? newAppendSpace : appendSpace,
        minMaxLiveViewportPrev: minMaxUnloadDistancePrev,
        minMaxLiveViewportNext: minMaxUnloadDistanceNext,
      })
      // })
    } else {
      // if we have more space, we shrink it and reduce scroll to match it
      // targetSpace < 0 does not make sense because scroll over negative scrollTop don't work
      const targetSpace = fixHead
        ? 0
        : Math.max(headFixed ? newPrependSpace : prependSpace, 0)
      const scrollOffset = -(newPrependSpace - targetSpace)

      const scrollLeft = el.scrollLeft
      const scrollTop = el.scrollTop

      // console.log(
      //   'target ', targetSpace,
      //   'current', newPrependSpace,
      //   'scroll pos', direction === 'x' ? scrollLeft : scrollTop,
      //   'target scroll', (direction === 'x' ? scrollLeft : scrollTop) + scrollOffset
      // )
      flushSync(() => {
        if (fixFoot) setFootFixed(true)
        if (fixHead) setHeadFixed(true)
        setDynamicScrollContext({
          startIndex: newStartIndex,
          dataStates: newDataStates,
          prependSpace: targetSpace,
          appendSpace: fixFoot ? 0 : footFixed ? newAppendSpace : appendSpace,
          minMaxLiveViewportPrev: minMaxUnloadDistancePrev,
          minMaxLiveViewportNext: minMaxUnloadDistanceNext,
        })
      })

      if (scrollOffset != 0) {
        if (forcedScrollSync) {
          const old = el.style.overflow
          el.style.overflow = 'hidden'
          el.getBoundingClientRect()
          requestAnimationFrame(() => {
            el.style.overflow = old
          })
        }

        if (direction === 'x') {
          el.scrollLeft = scrollLeft + scrollOffset
          markScrollChange()
        } else {
          el.scrollTop = scrollTop + scrollOffset
          markScrollChange()
        }

        if (forcedScrollSync) {
          if (direction === 'x') {
            fixFreezingScrollBar(el, direction, scrollLeft + scrollOffset)
          } else {
            fixFreezingScrollBar(el, direction, scrollTop + scrollOffset)
          }
          el.getBoundingClientRect()

          // console.log(el.scrollLeft, el.scrollTop)
        }
      }
    }

    // check once more after apply changes in case insert/shrink once isn't enough
    if (
      sortedNonPatchTask.filter(
        (i) =>
          i.action !== 'fixHead' &&
          i.action !== 'fixFoot' &&
          i.action !== 'resync' &&
          i.action !== 'forceSync'
      ).length > 0
    ) {
      // event here because it happen
      performCheckEvent()
    }

    if (
      sortedNonPatchTask.filter(
        (i) =>
          i.action === 'append' ||
          i.action === 'prepend' ||
          i.action === 'unloadNext' ||
          i.action === 'unloadPrev'
      ) != null
    ) {
      const currentContext = dynamicScrollContext
      const currentScroll = direction === 'y' ? el.scrollTop : el.scrollLeft
      const currentSize = direction === 'y' ? el.offsetHeight : el.offsetWidth
      const [index, offset] = anchorStrategyDefault(
        currentContext.dataStates,
        currentContext.prependSpace,
        currentScroll,
        currentSize,
        lastTouchPosition.current
      )
      const currentItem = currentContext.dataStates.find(
        (i) => i.index === index
      )
      onProgress(currentItem, offset, currentContext.dataStates)
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
    const item = dynamicScrollContext.dataStates.find((i) => i.index === index)
    if (item) {
      appendTask({
        action: 'patch',
        items: [
          {
            index,
            data: item.data,
            size: height,
          },
        ],
      })
    }
  }

  const onItemSizeUpdateEvent = useEvent(onItemSizeUpdate)

  const resizeRef = useObserveElements(onItemSizeUpdate)

  const createFactory =
    (direction: 'next' | 'prev', boundaryIndex: number): EntryFactory =>
    (index: number, size: number) => {
      if (direction === 'next') {
        return {
          resizeRef: (el) => resizeRef(el, boundaryIndex + index + 1),
          updateSize: (newHeight) =>
            onItemSizeUpdateEvent(newHeight, boundaryIndex + index + 1),
          index: boundaryIndex + index + 1,
        }
      } else {
        return {
          resizeRef: (el) => resizeRef(el, boundaryIndex - size + index),
          updateSize: (newHeight) =>
            onItemSizeUpdateEvent(newHeight, boundaryIndex - size + index),
          index: boundaryIndex - size + index,
        }
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
    const distanceToEnd =
      currentContext.prependSpace + heightSum - (currentScroll + currentSize)

    const indexPrev = currentContext.startIndex
    const indexNext =
      currentContext.startIndex + currentContext.dataStates.length - 1

    if (distanceToHead < preloadRange) {
      if (
        pendingJob.current.find(
          (i) => i.action === 'loadPrev' && i.index === indexPrev
        ) == null &&
        taskList.current.find((i) => i.action === 'prepend') == null
      ) {
        removeJobOfType('loadPrev')
        removeTaskOfType('prepend')
        removeTaskOfType('unloadPrev')
        const controller = new AbortController()
        onLoadMore(
          'prev',
          createFactory('prev', indexPrev),
          currentContext.dataStates,
          controller.signal
        ).then(
          (res) => {
            if (controller.signal.aborted) return
            removeJobOfType('loadPrev')
            if (res === END_OF_STREAM) {
              appendTask({
                action: 'fixHead',
              })
              // setHeadFixed(true)
            } else {
              appendTask({
                action: 'prepend',
                items: res.map((item) => ({
                  el: item[0],
                  data: item[1],
                  index: item[1].index,
                  size: item[1].initialHeight,
                })),
              })
            }
          },
          (err: unknown) => {
            if (controller.signal.aborted) return
            console.error(err)
          }
        )
        appendJob({
          action: 'loadPrev',
          index: indexPrev,
          controller,
        })
      }
    }
    if (distanceToEnd < preloadRange) {
      if (
        pendingJob.current.find(
          (i) => i.action === 'loadNext' && i.index === indexNext
        ) == null &&
        taskList.current.find((i) => i.action === 'append') == null
      ) {
        removeJobOfType('loadNext')
        removeTaskOfType('append')
        removeTaskOfType('unloadNext')
        const controller = new AbortController()
        onLoadMore(
          'next',
          createFactory('next', indexNext),
          currentContext.dataStates,
          controller.signal
        ).then(
          (res) => {
            if (controller.signal.aborted) return
            removeJobOfType('loadNext')
            if (res === END_OF_STREAM) {
              appendTask({
                action: 'fixFoot',
              })
              // setFootFixed(true)
            } else {
              appendTask({
                action: 'append',
                items: res.map((item) => ({
                  el: item[0],
                  data: item[1],
                  index: item[1].index,
                  size: item[1].initialHeight,
                })),
              })
            }
          },
          (err: unknown) => {
            if (controller.signal.aborted) return
            console.error(err)
          }
        )
        appendJob({
          action: 'loadNext',
          index: indexNext,
          controller,
        })
      }
    }

    if (distanceToHead > maxLiveViewportPrev) {
      removeTaskOfType('unloadPrev')
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
        action: 'unloadPrev',
        count,
      })
    }
    if (distanceToEnd > maxLiveViewportNext) {
      removeTaskOfType('unloadNext')
      const toUnloadDist = distanceToEnd - maxLiveViewportNext
      let sum = 0
      let count = 0
      for (let i = currentContext.dataStates.length - 1; i >= 0; i--) {
        sum += currentContext.dataStates[i].size
        // console.log(sum)
        count++
        if (sum >= toUnloadDist) {
          break
        }
      }
      appendTask({
        action: 'unloadNext',
        count,
      })
    }

    // console.log(REQUIRE_SAFARI_WORKAROUND, currentContext.prependSpace, currentScroll, headFixed)

    if (
      REQUIRE_SAFARI_WORKAROUND &&
      isScrolling.current &&
      currentScroll < SCROLL_RESET_THRESHOLD &&
      !headFixed
    ) {
      // console.log('force reset')
      appendTask({ action: 'forceSync' })
    }
  }

  const performCheckEvent = useEvent(performCheck)
  const onScroll = () => {
    performCheck()
    const el = elementRef.current
    if (!el) return

    const currentContext = dynamicScrollContext
    const currentScroll = direction === 'y' ? el.scrollTop : el.scrollLeft
    const currentSize = direction === 'y' ? el.offsetHeight : el.offsetWidth
    const [index, offset] = anchorStrategyDefault(
      currentContext.dataStates,
      currentContext.prependSpace,
      currentScroll,
      currentSize,
      lastTouchPosition.current
    )
    const currentItem = currentContext.dataStates.find((i) => i.index === index)
    onProgress(currentItem, offset, currentContext.dataStates)
  }

  const onScrollEvent = useEvent(onScroll)

  const markScrollChange = useScrollingEvent({
    ref: elementRef,
    onScrollChange(status) {
      if (isScrolling.current && !status) {
        isScrolling.current = status
        appendTask({ action: 'resync' })
      } else {
        isScrolling.current = status
      }
    },
  })

  // handle touch positions
  const onTouchPositionChange: TouchEventHandler<HTMLDivElement> = (ev) => {
    const el = elementRef.current
    if (el == null) {
      return
    }

    const rootPosition = el.getBoundingClientRect()

    for (const touch of Array.from(ev.touches)) {
      if (el.contains(touch.target as Element)) {
        const dist =
          direction === 'x'
            ? touch.clientX - rootPosition.x
            : touch.clientY - rootPosition.y

        // console.log('touch at ' + dist)
        lastTouchPosition.current = dist
      }
    }
  }

  const elements = useMemo(() => {
    return dynamicScrollContext.dataStates.map((i) => {
      return (
        <div
          key={i.index}
          style={
            direction === 'y'
              ? {
                  height: i.size + 'px',
                }
              : {
                  width: i.size + 'px',
                }
          }
        >
          {i.el}
        </div>
      )
    })
  }, [dynamicScrollContext.dataStates, direction])

  const prependedElement = useMemo(() => {
    return prependContent ? (
      <div
        className={`extra-${direction}`}
        style={
          direction === 'y'
            ? {
                height: dynamicScrollContext.prependSpace + 'px',
              }
            : {
                width: dynamicScrollContext.prependSpace + 'px',
              }
        }
      >
        {prependContent}
      </div>
    ) : undefined
  }, [direction, dynamicScrollContext.prependSpace, prependContent])

  const appendedElement = useMemo(() => {
    return appendContent ? (
      <div
        className={`extra-${direction}`}
        style={
          direction === 'y'
            ? {
                height: dynamicScrollContext.appendSpace + 'px',
                transform: `translateY(${
                  dynamicScrollContext.prependSpace + itemSizeSum
                }px)`,
              }
            : {
                width: dynamicScrollContext.appendSpace + 'px',
                transform: `translateX(${
                  dynamicScrollContext.prependSpace + itemSizeSum
                }px)`,
              }
        }
      >
        {appendContent}
      </div>
    ) : undefined
  }, [
    appendContent,
    direction,
    dynamicScrollContext.appendSpace,
    dynamicScrollContext.prependSpace,
    itemSizeSum,
  ])

  return (
    <div
      {...props}
      ref={elementRef}
      style={style}
      className={'dyn root' + (className ? `  ${className}` : '')}
      onScroll={onScroll}
      onTouchStart={onTouchPositionChange}
      onTouchMove={onTouchPositionChange}
    >
      <div style={stageStyle} />
      {prependedElement}
      <div
        className={`container-${direction}`}
        style={
          direction === 'y'
            ? {
                transform: `translateY(${dynamicScrollContext.prependSpace}px)`,
              }
            : {
                transform: `translateX(${dynamicScrollContext.prependSpace}px)`,
              }
        }
        ref={containerRef}
      >
        {elements}
      </div>
      {appendedElement}
    </div>
  )
}
