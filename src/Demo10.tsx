import { CSSProperties, ReactElement, ReactNode, forwardRef } from "react";
import {
  DynamicScroll,
  DynamicChildElementProps,
  LoadHandler,
  AnchorSelector,
} from "./DynamicScroll";
import "./Demo10.css";
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

export function Demo10({ className }: { className?: string }) {
  const MIN_INDEX = 0;
  const onPrepend: LoadHandler<{
    index: number;
    initialHeight: number;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  }> = async (index, _props, _data, _signal) => {
    await new Promise<void>((resolve) => setTimeout(resolve, DELAY));
    const arr: Array<
      [
        ReactElement<DynamicChildElementProps>,
        { index: number; initialHeight: number }
      ]
    > = [];
    if (index <= MIN_INDEX) {
      return END_OF_STREAM;
    }
    for (let i = 0; i < COUNT && index - i - 1 >= MIN_INDEX; i++) {
      const height = 400;
      const color = ~~(360 * Math.random());
      arr.unshift([
        <ResizedElement
          style={{ background: `hsl(${color}deg 30% 60%)` }}
          key={index - i - 1}
          ref={(el) => _props.resizeRef(el, index - i - 1)}
        >
          index: {index - i - 1} <br />
          height: {height}
        </ResizedElement>,
        { index: index - i - 1, initialHeight: height },
      ]);
    }
    console.log("p", index, arr);
    return arr;
  };

  const MAX_INDEX = 100;
  const onAppend: LoadHandler<{
    index: number;
    initialHeight: number;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  }> = async (index, _props, _data, _signal) => {
    await new Promise<void>((resolve) => setTimeout(resolve, DELAY));
    const arr: Array<
      [
        ReactElement<DynamicChildElementProps>,
        { index: number; initialHeight: number }
      ]
    > = [];
    if (index >= MAX_INDEX) {
      return END_OF_STREAM;
    }
    for (let i = 0; i < COUNT && index + i + 1 <= MAX_INDEX; i++) {
      const height = 400;
      const color = ~~(360 * Math.random());
      arr.push([
        <ResizedElement
          style={{ background: `hsl(${color}deg 30% 60%)` }}
          key={index + i + 1}
          ref={(el) => _props.resizeRef(el, index + i + 1)}
        >
          index: {index + i + 1} <br />
          height: {height}
        </ResizedElement>,
        { index: index + i + 1, initialHeight: height },
      ]);
    }
    console.log("a", index, arr);
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
      onPrepend={onPrepend}
      onAppend={onAppend}
      onSelectAnchor={onSelectAnchor}
    />
  );
}
