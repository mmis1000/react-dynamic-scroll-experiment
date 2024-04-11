import { ReactElement, useState } from 'react'
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
  onJump = () => {},
}: {
  className?: string
  startIndex: number
  onJump: (target: number) => void
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
      direction === 'next' ? Math.min(1 - factory(0, 1).index, COUNT) : COUNT

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

  // FIXME: wrong offset
  const onProgress: ProgressHandler<{ index: number; initialHeight: number }> =
    console.log

  return (
    <DynamicScroll
      className={className}
      prependSpace={5000}
      initialFootLocked={startIndex !== 0}
      initialAppendSpace={startIndex === 0 ? 0 : undefined}
      initialIndex={startIndex}
      onLoadMore={onLoadMore}
      onProgress={onProgress}
      scrollRoot="end"
    />
  )
}

export function DemoChat({ className }: { className?: string }) {
  const [initialIndex, setInitialIndex] = useState(0)
  const [instId, setInstId] = useState(0)

  return (
    <ChatView
      key={instId}
      className={className}
      startIndex={initialIndex}
      onJump={(i) => {
        setInitialIndex(i + 1), setInstId((i) => i + 1)
      }}
    />
  )
}
