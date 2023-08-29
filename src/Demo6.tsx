import { CSSProperties, ReactElement, ReactNode, forwardRef } from "react"
import { DynamicScroll, DynamicChildElementProps, LoadHandler, AnchorSelector, getHeight } from "./DynamicScroll"
import './Demo6.css'

const COUNT = 8
const DELAY = 200

const ResizedElement = forwardRef<HTMLDivElement, {
  style?: CSSProperties,
  className?: string,
  children?: ReactNode
}>(({ 
  style,
  className,
  children
}, ref) => {

  return <div ref={ref} style={{ ...(style ?? {}), aspectRatio: '1' }} className={className}>
    {children}
  </div>
})

export function Demo6 ({
    className
}: { className?: string }) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onPrepend: LoadHandler<{ index: number, initialHeight: number }> = async (index, _props, _data, _signal) => {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY))
      const arr: Array<[ReactElement<DynamicChildElementProps>, { index: number, initialHeight: number }]> = []
      for (let i = 0; i < COUNT; i++) {
        const height = 400
        const color = ~~(360 * Math.random())
        arr.unshift([<ResizedElement
          style={{background: `hsl(${color}deg 30% 60%)`}}
          key={index - i - 1}
          ref={(el) => _props.resizeRef(el, index - i - 1)}
        >
          index: {index - i - 1} <br/>
          height: {height}
        </ResizedElement>, { index: index - i - 1, initialHeight: height }])
      }
      return arr
    }
  
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onAppend: LoadHandler<{ index: number, initialHeight: number }> = async (index, _props, _data, _signal) => {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY))
      const arr: Array<[ReactElement<DynamicChildElementProps>, { index: number, initialHeight: number }]> = []
      for (let i = 0; i < COUNT; i++) {
        const height = 400
        const color = ~~(360 * Math.random())
        arr.push([<ResizedElement
          style={{background: `hsl(${color}deg 30% 60%)`}}
          key={index + i + 1}
          ref={(el) => _props.resizeRef(el, index + i + 1)}
        >
          index: {index + i + 1} <br/>
          height: {height}
        </ResizedElement>, { index: index + i + 1, initialHeight: height }])
      }
      return arr
    }

    const onSelectAnchor: AnchorSelector<{ index: number, initialHeight: number }> = (entries, index, offset, containerHeight, lastTouchPosition) => {
      console.log(entries, index, offset, containerHeight, lastTouchPosition)
      const rootItemArrayIndex = entries.findIndex(e => e.index === index)
      let currentSelection = index
      let currentOffset = offset
      let currentShortestDist = Math.abs(offset + lastTouchPosition)
      for (let i = rootItemArrayIndex; i < entries.length - 1; i++) {
        // check for next entry
        const nextSelection = entries[i + 1].index
        const nextOffset = currentOffset - getHeight(entries[i])
        const nextShortestDist = Math.abs(nextOffset + lastTouchPosition)

        if (nextShortestDist < currentShortestDist) {
          currentSelection = nextSelection
          currentOffset = nextOffset
          currentShortestDist = nextShortestDist
        } else {
          break
        }
      }
      return [currentSelection, currentOffset, ]
    }
  
    return <DynamicScroll className={className} prependSpace={5000} appendSpace={5000} onPrepend={onPrepend} onAppend={onAppend} onSelectAnchor={onSelectAnchor}/>
}