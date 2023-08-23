import { CSSProperties, ReactElement, ReactNode, forwardRef, useEffect, useRef, useState } from "react"
import { DynamicScroll, DynamicChildElementProps, LoadHandler, AnchorSelector, getHeight } from "./DynamicScroll"
import './Demo5.css'

const COUNT = 8
const DELAY = 200

const ResizedElement = forwardRef<HTMLDivElement, {
  initialHeight: number,
  newHeight: number,
  delay: number,
  style?: CSSProperties,
  className?: string,
  onResize?: () => void,
  children?: ReactNode
}>(({ 
  initialHeight,
  newHeight,
  delay,
  style,
  className,
  onResize,
  children
}, ref) => {
  const loadTime = useRef(Date.now())
  const resizeTime = loadTime.current + delay
  const [height, setHeight] = useState(initialHeight)
  useEffect(() => {
    if (resizeTime < Date.now()) {
      setHeight(newHeight)
      return
    } else {
      const id = setTimeout(() => {
        setHeight(newHeight)
        onResize?.()
      }, resizeTime - Date.now())
      return () => {
        clearTimeout(id)
      }
    }
  }, [newHeight, onResize, resizeTime])

  return <div ref={ref} style={{ ...(style ?? {}), height: `${height}px` }} className={className}>
    {children}
  </div>
})

export function Demo5 ({
    className
}: { className?: string }) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onPrepend: LoadHandler<{ index: number, initialHeight: number }> = async (index, _props, _data, _signal) => {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY))
      const arr: Array<[ReactElement<DynamicChildElementProps>, { index: number, initialHeight: number }]> = []
      for (let i = 0; i < COUNT; i++) {
        const height = ~~(Math.random() * 50 + 75)
        const color = ~~(360 * Math.random())
        arr.unshift([<ResizedElement
          style={{background: `hsl(${color}deg 30% 60%)`}}
          key={index - i - 1}
          initialHeight={height}
          newHeight={(index - i - 1) % 5 === 0 ? height + 100 : height}
          delay={5000}
          ref={(el) => _props.resizeRef(el, index - i - 1)}
        >
          index: {index - i - 1} <br/>
          height: {height}
          {(index - i - 1) % 5 === 0 ? 'will resize' : ''}
        </ResizedElement>, { index: index - i - 1, initialHeight: height }])
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
        arr.push([<ResizedElement
          style={{background: `hsl(${color}deg 30% 60%)`}}
          key={index + i + 1}
          initialHeight={height}
          newHeight={(index + i + 1) % 5 === 0 ? height + 100 : height}
          delay={5000}
          ref={(el) => _props.resizeRef(el, index + i + 1)}
        >
          index: {index + i + 1} <br/>
          height: {height}
          {(index + i + 1) % 5 === 0 ? 'will resize' : ''}
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
          console.log(currentOffset + lastTouchPosition)
        } else {
          console.log('break at', nextSelection, nextOffset, nextShortestDist)
          break
        }
      }
      console.log(index, offset, currentSelection, currentOffset, currentShortestDist)
      return [currentSelection, currentOffset, ]
    }
  
    return <DynamicScroll className={className} prependSpace={5000} appendSpace={5000} onPrepend={onPrepend} onAppend={onAppend} onSelectAnchor={onSelectAnchor}/>
}