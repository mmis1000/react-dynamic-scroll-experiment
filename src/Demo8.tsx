import { CSSProperties, ReactElement, ReactNode, forwardRef } from "react";
import {
  DynamicScroll,
  DynamicChildElementProps,
  LoadHandler,
  AnchorSelector,
} from "./DynamicScroll";
import "./Demo8.css";
import { END_OF_STREAM, getHeight } from "./DynamicScrollUtils";

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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


  const onSelectAnchor: AnchorSelector<{
    index: number;
    initialHeight: number;
  }> = (entries, index, offset, containerHeight, lastTouchPosition) => {
    console.log(entries, index, offset, containerHeight, lastTouchPosition);
    const rootItemArrayIndex = entries.findIndex((e) => e.index === index);
    if (rootItemArrayIndex < 0) {
      return [index, offset];
    }
    let currentSelection = index;
    let currentOffset = offset;
    let currentShortestDist = Math.abs(offset + lastTouchPosition);
    for (let i = rootItemArrayIndex; i < entries.length - 1; i++) {
      // check for next entry
      const nextSelection = entries[i + 1].index;
      const nextOffset = currentOffset - getHeight(entries[i]);
      const nextShortestDist = Math.abs(nextOffset + lastTouchPosition);

      if (nextShortestDist < currentShortestDist) {
        currentSelection = nextSelection;
        currentOffset = nextOffset;
        currentShortestDist = nextShortestDist;
      } else {
        break;
      }
    }
    return [currentSelection, currentOffset];
  };

  return (
    <DynamicScroll
      className={className}
      prependSpace={100}
      appendSpace={100}
      prependContent="Loading..."
      appendContent="Loading..."
      onLoadMore={onLoadMore}
      onSelectAnchor={onSelectAnchor}
    />
  );
}
