import { CSSProperties, ReactElement, ReactNode, forwardRef, useEffect, useRef, useState } from "react"
import { DynamicScroll, DynamicChildElementProps, LoadHandler } from "./DynamicScroll"
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
    const onLoadMore: LoadHandler<{
      index: number;
      initialHeight: number;
    }> = async (_direction, factory, _data, _signal) => {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY))
      const arr: Array<[ReactElement<DynamicChildElementProps>, { index: number, initialHeight: number }]> = []
      for (let i = 0; i < COUNT; i++) {
        const height = ~~(Math.random() * 50 + 75)
        const color = ~~(360 * Math.random())
        arr.push([<ResizedElement
          style={{background: `hsl(${color}deg 30% 60%)`}}
          initialHeight={height}
          newHeight={height + 50}
          delay={5000}
          ref={factory(i, COUNT).resizeRef}
        >
          index: {factory(i, COUNT).index} <br/>
          height: {height}
        </ResizedElement>, { index: factory(i, COUNT).index, initialHeight: height }])
      }
      return arr
    }
  
    return <DynamicScroll className={className} prependSpace={5000} appendSpace={5000} onLoadMore={onLoadMore} onSelectAnchor={'touch'}/>
}