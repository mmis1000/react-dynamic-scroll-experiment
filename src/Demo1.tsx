import { ReactElement } from "react"
import { DynamicScroll, DynamicChildElementProps, LoadHandler } from "./DynamicScroll"
import './Demo1.css'

const COUNT = 8
const DELAY = 200

export function Demo1 ({
    className
}: { className?: string }) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onPrepend: LoadHandler<{ index: number, initialHeight: number }> = async (index, _props, _data, _signal) => {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY))
      const arr: Array<[ReactElement<DynamicChildElementProps>, { index: number, initialHeight: number }]> = []
      for (let i = 0; i < COUNT; i++) {
        const height = ~~(Math.random() * 50 + 75)
        const color = ~~(360 * Math.random())
        arr.unshift([<div style={{height: height, background: `hsl(${color}deg 30% 60%)`}} key={index - i - 1}>
          index: {index - i - 1} <br/>
          height: {height}
        </div>, { index: index - i - 1, initialHeight: height }])
      }
      return arr
    }
  
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onAppend: LoadHandler<{ index: number, initialHeight: number }> = async (index, _props, _data, _signal) => {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY))
      const arr: Array<[ReactElement<DynamicChildElementProps>, { index: number, initialHeight: number }]> = []
      for (let i = 0; i < COUNT; i++) {
        const height = ~~(Math.random() * 50 + 75)
        const color = ~~(360 * Math.random())
        arr.push([<div style={{height: height, background: `hsl(${color}deg 30% 60%)`}} key={index + i + 1}>
          index: {index + i + 1} <br/>
          height: {height}
        </div>, { index: index + i + 1, initialHeight: height }])
      }
      return arr
    }
  
    return <DynamicScroll className={className} prependSpace={5000} appendSpace={5000} onPrepend={onPrepend} onAppend={onAppend}/>
}