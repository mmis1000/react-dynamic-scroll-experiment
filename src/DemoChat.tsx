import { ReactElement } from 'react'
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

export function DemoChat({ className }: { className?: string }) {
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
      const color = ~~(360 * Math.random())
      arr.push([
        <div style={{ height: height, background: `hsl(${color}deg 30% 60%)` }}>
          index: {entryInfo.index} <br />
          height: {height}
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
      initialAppendSpace={0}
      initialFootLocked
      onLoadMore={onLoadMore}
      onProgress={onProgress}
      scrollRoot="end"
    />
  )
}
