import { CSSProperties, ReactElement, ReactNode, forwardRef } from "react"
import { DynamicScroll, DynamicChildElementProps, LoadHandler } from "./DynamicScroll"
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

export function Demo6({
  className
}: { className?: string }) {
  const onLoadMore: LoadHandler<{
    index: number;
    initialHeight: number;
  }> = async (_direction, factory, _data, _signal) => {
    await new Promise<void>((resolve) => setTimeout(resolve, DELAY));
    const arr: Array<
      [
        ReactElement<DynamicChildElementProps>,
        { index: number; initialHeight: number }
      ]
    > = [];

    const amount = COUNT

    for (let i = 0; i < amount; i++) {
      const height = 400;
      const color = ~~(360 * Math.random());
      arr.push([
        <ResizedElement
          style={{ background: `hsl(${color}deg 30% 60%)` }}
          ref={factory(i, amount).resizeRef}
        >
          index: {factory(i, amount).index} <br />
          height: {height}
        </ResizedElement>,
        { index: factory(i, amount).index, initialHeight: height },
      ]);
    }
    return arr;
  };

  return <DynamicScroll className={className} prependSpace={5000} appendSpace={5000} onLoadMore={onLoadMore} onSelectAnchor={'touch'} />
}