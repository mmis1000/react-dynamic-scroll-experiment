import { ReactElement } from "react"
import { DynamicScroll, DynamicChildElementProps, LoadHandler } from "./DynamicScroll"
import './Demo1.css'

const COUNT = 8
const DELAY = 200

export function Demo1 ({
    className
}: { className?: string }) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onLoadMore: LoadHandler<{ index: number, initialHeight: number }> = async (_direction, factory, _data, _signal) => {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY))
      const arr: Array<[ReactElement<DynamicChildElementProps>, { index: number, initialHeight: number }]> = []
      for (let i = 0; i < COUNT; i++) {
        const entryInfo = factory(i, COUNT)
        const height = ~~(Math.random() * 50 + 75)
        const color = ~~(360 * Math.random())
        arr.push([<div style={{height: height, background: `hsl(${color}deg 30% 60%)`}}>
          index: {entryInfo.index} <br/>
          height: {height}
        </div>, { index: entryInfo.index, initialHeight: height }])
      }
      return arr
    }
  
    return <DynamicScroll className={className} prependSpace={5000} appendSpace={5000} onLoadMore={onLoadMore} />
}