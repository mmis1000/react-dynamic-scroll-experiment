import { CSSProperties, ReactNode, forwardRef } from "react";
import {
  DynamicScroll,
  LoadHandler,
  AnchorSelector,
  DataBase,
} from "./DynamicScroll";
import "./DemoRealWorld1.css";
import { END_OF_STREAM, getHeight } from "./DynamicScrollUtils";

const COUNT = 10;

const API_BASE = "https://api.pexels.com/v1/curated"
const API_KEY = "S6Q7YlUQjfI3zdss4TANCEKEs2FuYhLz6Bi4GT5mGNFJfN6dfnqYL02y"
interface PhotoItem {
  src:{medium:string}
  alt: string,
  photographer: string,
  photographer_url: string
}
const getData = async (signal: AbortSignal, page: number, pageSize: number) => {
  const request = new Request(`${API_BASE}?page=${page}&per_page=${pageSize}`, {
    headers: {
      Authorization: API_KEY
    },
    signal
  })
  const res = await fetch(request)
  const json = await res.json()
  console.log(json)
  return json as { photos: PhotoItem[] }
}

interface Data extends DataBase {
  /** 1 index */
  page: number
  pageSize: number
  itemIndex: number,
  items: PhotoItem[]
}

const ImageElement = forwardRef<
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
      style={{ ...(style ?? {}), display: 'flex', justifyContent: 'stretch' }}
      className={className ? 'item ' + className : 'item'}
    >
      {children}
    </div>
  );
});

export function DemoRealWorld1({ className }: { className?: string }) {
  const onPrepend: LoadHandler<Data> = async (index, _props, data, _signal) => {
    const next = data[0]

    let items: PhotoItem[]
    let page: number
    let pageSize: number

    if (next == null) {
      return END_OF_STREAM
    } else if (next.data.itemIndex !== 0) {
      items = next.data.items.slice(0, next.data.itemIndex)
      page = next.data.page
      pageSize = next.data.pageSize
    } else {
      const currentPage = next.data.page - 1

      if (currentPage < 1) return END_OF_STREAM

      const { photos } = await getData(_signal, currentPage, next.data.pageSize)
      items = photos
      page = currentPage
      pageSize = next.data.pageSize
    }

    if (items.length === 0) {
      return END_OF_STREAM
    }


    return items.map((data, index2, arr) => [
      <ImageElement
        key={index - arr.length + index2}
        ref={(el) => _props.resizeRef(el, index - arr.length + index2)}
      >
        <img src={data.src.medium} style={{width: '100%'}} />
        <div className="index">{index - arr.length + index2}</div>
        <div className="caption">{data.alt}</div>
        <a className="author" href={data.photographer_url} target="_blank">{data.photographer}</a>
      </ImageElement>,
      {
        index: index - arr.length + index2,
        page,
        pageSize,
        items,
        itemIndex: index2,
        initialHeight: 1000
      }
    ])
  };

  const onAppend: LoadHandler<Data> = async (index, _props, data, _signal) => {
    const prev = data[data.length - 1]

    let items: PhotoItem[]
    let page: number
    let pageSize: number
    let baseItemIndex: number

    if (prev == null) {
      const { photos } = await getData(_signal, 1, COUNT)
      items = photos
      page = 1
      pageSize = COUNT
      baseItemIndex = 0
    } else if (prev.data.itemIndex !== prev.data.pageSize - 1) {
      items = prev.data.items.slice(prev.data.itemIndex + 1)
      page = prev.data.page
      pageSize = prev.data.pageSize
      baseItemIndex = prev.data.itemIndex + 1
    } else {
      const currentPage = prev.data.page + 1

      if (currentPage < 1) return END_OF_STREAM

      const { photos } = await getData(_signal, currentPage, prev.data.pageSize)
      items = photos
      page = currentPage
      pageSize = prev.data.pageSize
      baseItemIndex = 0
    }

    if (items.length === 0) {
      return END_OF_STREAM
    }

    return items.map((data, index2) => [
      <ImageElement
        key={index + 1 + index2}
        ref={(el) => _props.resizeRef(el, index + 1 + index2)}
      >
        <img src={data.src.medium} style={{width: '100%'}} />
        <div className="index">{index + 1 + index2}</div>
        <div className="caption">{data.alt}</div>
        <a className="author" href={data.photographer_url} target="_blank">{data.photographer}</a>
      </ImageElement>,
      {
        index: index + 1 + index2,
        page,
        pageSize,
        items,
        itemIndex: baseItemIndex + index2,
        initialHeight: 1000
      }
    ])
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
      className={className ? 'real ' + className : 'real'}
      prependSpace={1000}
      appendSpace={1000}
      preloadRange={3000}
      prependContent="Loading..."
      appendContent="Loading..."
      onPrepend={onPrepend}
      onAppend={onAppend}
      onSelectAnchor={onSelectAnchor}
    />
  );
}
