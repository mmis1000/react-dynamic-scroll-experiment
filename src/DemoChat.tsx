import { ReactElement, useRef, useState } from 'react'
import {
  DynamicScroll,
  DynamicChildElementProps,
  LoadHandler,
  ProgressHandler,
} from './DynamicScroll'
import './DemoChat.css'
import { END_OF_STREAM } from './DynamicScrollUtils'

const COUNT = 8
const DELAY = 20

export function ChatView({
  className,
  startIndex = 0,
  startOffset = 0,
  onJump = () => {},
  onProgress: onProgressUpdate = (index, offset) => {},
}: {
  className?: string
  startIndex: number
  startOffset: number
  onJump: (target: number) => void
  onProgress: (index: number, offset: number) => void,
}) {
  const onLoadMore: LoadHandler<{
    index: number
    initialHeight: number
  }> = async (direction, factory, _data, _signal) => {
    await new Promise<void>((resolve) => setTimeout(resolve, DELAY))
    const arr: Array<
      [
        ReactElement<DynamicChildElementProps>,
        { index: number; initialHeight: number }
      ]
    > = []
    if (direction === 'next' && factory(0, 1).index >= 0) {
      return END_OF_STREAM
    }

    const count =
      direction === 'next' ? Math.min(0 - factory(0, 1).index, COUNT) : COUNT

    for (let i = 0; i < count; i++) {
      const entryInfo = factory(i, count)
      const height = 80
      let goto =
        entryInfo.index % 20 === 0
          ? entryInfo.index - 500
          : entryInfo.index % 20 === -1
          ? entryInfo.index + 500
          : entryInfo.index % 10 === 0
          ? entryInfo.index - 100
          : entryInfo.index % 10 === -1
          ? entryInfo.index + 100
          : entryInfo.index % 5 === 0
          ? entryInfo.index - 50
          : entryInfo.index % 5 === -1
          ? entryInfo.index + 50
          : null

      const color = `hsl(${(entryInfo.index * 30 + 360) % 360}deg 30% 60%)`

      goto = goto == null || goto >= 0 ? null : goto

      arr.push([
        <div style={{ height: height, background: color }}>
          index: {entryInfo.index} <br />
          height: {height}
          {goto && <button onClick={() => onJump(goto!)}>Go to {goto}</button>}
        </div>,
        { index: entryInfo.index, initialHeight: height },
      ])
    }
    return arr
  }
  const onProgress: ProgressHandler<{ index: number; initialHeight: number }> = (current, index, offset, full) => {
    console.log(index, offset)
    onProgressUpdate(index, offset)
  }

  return (
    <DynamicScroll
      className={className}
      prependSpace={5000}
      initialFootLocked={startIndex !== 0}
      initialAppendSpace={startIndex === 0 ? 0 : undefined}
      initialIndex={startIndex}
      initialOffset={startOffset}
      onLoadMore={onLoadMore}
      onProgress={onProgress}
      scrollRoot="end"
    />
  )
}


const useInitialPageParam = function <T>(
  name: string,
  defaultValue: string,
  transform: (str: string) => T
) {
  const url = new URL(location.href)
  const initialPageStr = url.searchParams.get(name) ?? defaultValue
  const initialPageParsed = transform(initialPageStr)
  const initialPageRefed = useRef(initialPageParsed)
  return initialPageRefed.current
}

export function DemoChat({ className }: { className?: string }) {

  const initialPageIndex = useInitialPageParam('index', '-1', (str) =>
    /^-?\d+$/.test(str) ? Number(str) : -1
  )
  const initialPageScroll = useInitialPageParam('scroll', '0', (str) =>
    /^-?\d+(\.\d+)?$/.test(str) ? Number(str) : 0
  )

  const [initialIndex, setInitialIndex] = useState(initialPageIndex)
  const [initialScroll, setInitialScroll] = useState(initialPageScroll)

  const [instId, setInstId] = useState(0)

  const rafId = useRef<null | ReturnType<typeof setTimeout>>(null)

  const onProgress = (index: number, offset: number) => {
    if (rafId.current != null) {
      clearTimeout(rafId.current)
    }

    const url = new URL(location.href)
    if (
      String(index) !== url.searchParams.get('index')
    ) {
      url.searchParams.set('index', String(index))
      url.searchParams.set('scroll', String(offset))
      history.replaceState(undefined, '', url)
    } else {
      rafId.current = setTimeout(() => {
        if (String(offset) !== url.searchParams.get('scroll')) {
          url.searchParams.set('index', String(index))
          url.searchParams.set('scroll', String(offset))
          history.replaceState(undefined, '', url)
        }
      }, 100)
    }
  }

  const jumpToItem = (item: number) => {
    setInitialScroll(0)
    setInitialIndex(item)
    setInstId((i) => i + 1)
  }

  return (
    <div className={`demo-chat ${className}`}>
      <ChatView
        className="view"
        key={instId}
        startIndex={initialIndex}
        startOffset={initialScroll}
        onJump={jumpToItem}
        onProgress={onProgress}
      />
      <button
        className="to-bottom"
        onClick={() => {
          jumpToItem(-1)
        }}
      >
        V
      </button>
    </div>
  )
}
