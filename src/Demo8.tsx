import { CSSProperties, ReactElement, ReactNode, forwardRef } from "react";
import {
  DynamicScroll,
  DynamicChildElementProps,
  LoadHandler
} from "./DynamicScroll";
import "./Demo8.css";
import { END_OF_STREAM } from "./DynamicScrollUtils";

const COUNT = 8;
const DELAY = 200;

const ResizedElement = forwardRef<
  HTMLDivElement,
  {
    style?: CSSProperties;
    className?: string;
    children?: ReactNode;
  }
>(({ style, className, children }, ref) => {
  return (
    <div
      ref={ref}
      style={{ ...(style ?? {}), aspectRatio: "1" }}
      className={className}
    >
      {children}
    </div>
  );
});

export function Demo8({ className }: { className?: string }) {
  const MIN_INDEX = -100;
  const MAX_INDEX = 100;

  const onLoadMore: LoadHandler<{
    index: number;
    initialHeight: number;
  }> = async (direction, factory, _data, _signal) => {
    await new Promise<void>((resolve) => setTimeout(resolve, DELAY));
    const arr: Array<
      [
        ReactElement<DynamicChildElementProps>,
        { index: number; initialHeight: number }
      ]
    > = [];
    let maxValidAmount: number
    if (direction ==='next') {
      if ( factory(0, 1).index > MAX_INDEX) {
        return END_OF_STREAM;
      }
      maxValidAmount = MAX_INDEX - factory(0, 1).index + 1
    } else {
      if (factory(0, 1).index < MIN_INDEX) {
        return END_OF_STREAM;
      }
      maxValidAmount = factory(0, 1).index - MIN_INDEX + 1
    }

    const amount = Math.min(maxValidAmount, COUNT)

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

  return (
    <DynamicScroll
      className={className}
      prependSpace={100}
      appendSpace={100}
      prependContent="Loading..."
      appendContent="Loading..."
      onLoadMore={onLoadMore}
      onSelectAnchor={'touch'}
    />
  );
}
