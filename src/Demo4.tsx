import { CSSProperties, ReactElement, ReactNode, forwardRef, useEffect, useRef, useState } from "react"
import { DynamicScroll, DynamicChildElementProps, LoadHandler, AnchorSelector } from "./DynamicScroll"
import './Demo4.css'

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

export function Demo4 ({
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
          newHeight={height + 50}
          delay={5000}
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
        const height = ~~(Math.random() * 50 + 75)
        const color = ~~(360 * Math.random())
        arr.push([<ResizedElement
          style={{background: `hsl(${color}deg 30% 60%)`}}
          key={index + i + 1}
          initialHeight={height}
          newHeight={height + 50}
          delay={5000}
          ref={(el) => _props.resizeRef(el, index + i + 1)}
        >
          index: {index + i + 1} <br/>
          height: {height}
        </ResizedElement>, { index: index + i + 1, initialHeight: height }])
      }
      return arr
    }

    const onSelectAnchor: AnchorSelector<{ index: number, initialHeight: number }> = (entries, index, offset, ...args) => {
      console.log(entries, index, offset, ...args)
      return [index, offset]
    }
  
    return <DynamicScroll className={className} prependSpace={5000} appendSpace={5000} onPrepend={onPrepend} onAppend={onAppend} onSelectAnchor={onSelectAnchor}/>
}