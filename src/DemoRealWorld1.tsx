import { CSSProperties, ReactNode, forwardRef, useRef, useState } from "react";
import {
  DynamicScroll,
  LoadHandler,
  AnchorSelector,
  DataBase,
  ProgressHandler,
} from "./DynamicScroll";
import "./DemoRealWorld1.css";
import { END_OF_STREAM, getHeight } from "./DynamicScrollUtils";

const COUNT = 10;

const API_BASE = "https://api.pexels.com/v1/curated";
const API_KEY = "S6Q7YlUQjfI3zdss4TANCEKEs2FuYhLz6Bi4GT5mGNFJfN6dfnqYL02y";
interface PhotoItem {
  src: { medium: string };
  alt: string;
  photographer: string;
  photographer_url: string;
  avg_color: string;
}
const getData = async (signal: AbortSignal, page: number, pageSize: number) => {
  const request = new Request(`${API_BASE}?page=${page}&per_page=${pageSize}`, {
    headers: {
      Authorization: API_KEY,
    },
    signal,
  });
  const res = await fetch(request);
  const json = await res.json();
  console.log(json);
  return json as { photos: PhotoItem[] };
};

interface Data extends DataBase {
  /** 1 index */
  page: number;
  pageSize: number;
  itemIndex: number;
  items: PhotoItem[];
}

const ImageElement = forwardRef<
  HTMLDivElement,
  {
    style?: CSSProperties;
    className?: string;
    children?: ReactNode;
    data: PhotoItem;
  }
>(({ style, className, children, data }, ref) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      ref={ref}
      style={{ ...(style ?? {}), display: "flex", justifyContent: "stretch" }}
      className={className ? "item " + className : "item"}
    >
      <img
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        src={data.src.medium}
        style={{ width: "100%" }}
        width={400}
        height={loaded ? undefined : 300}
      />
      {children}
    </div>
  );
});

export function DemoRealWorld1({ className }: { className?: string }) {
  const url = new URL(location.href);
  const initialPageStr = url.searchParams.get("page") ?? "1";
  const initialPageParsed = /\d+/.test(initialPageStr)
    ? Number(initialPageStr)
    : 1;
  const initialPageRefed = useRef(initialPageParsed);

  const onLoadMore: LoadHandler<Data> = async (
    direction,
    factory,
    data,
    _signal
  ) => {
    const bound = direction === "prev" ? data[0] : data[data.length - 1];

    let items: PhotoItem[];
    let fullItems: PhotoItem[];
    let page: number;
    let pageSize: number;
    let baseItemIndex: number;

    if (bound == null) {
      if (direction === "prev") {
        return END_OF_STREAM;
      } else {
        page = initialPageRefed.current;
        pageSize = COUNT;
        const { photos } = await getData(_signal, page, COUNT);
        fullItems = items = photos;
        baseItemIndex = 0;
      }
    } else if (
      direction === "prev"
        ? bound.data.itemIndex !== 0
        : bound.data.itemIndex !== bound.data.pageSize - 1
    ) {
      // print remaining items in data field
      fullItems = bound.data.items;
      items =
        direction === "prev"
          ? bound.data.items.slice(0, bound.data.itemIndex)
          : bound.data.items.slice(bound.data.itemIndex + 1);
      page = bound.data.page;
      pageSize = bound.data.pageSize;
      baseItemIndex = direction === "prev" ? 0 : bound.data.itemIndex + 1;
    } else {
      // fetch new data
      const currentPage =
        direction === "prev" ? bound.data.page - 1 : bound.data.page + 1;

      if (currentPage < 1) return END_OF_STREAM;

      const { photos } = await getData(
        _signal,
        currentPage,
        bound.data.pageSize
      );
      fullItems = items = photos;
      page = currentPage;
      pageSize = bound.data.pageSize;
      baseItemIndex = 0;
    }

    if (items.length === 0) {
      return END_OF_STREAM;
    }

    return items.map((data, index2, arr) => [
      <ImageElement
        ref={factory(index2, arr.length).resizeRef}
        style={{ backgroundColor: data.avg_color }}
        data={data}
      >
        <div className="index">
          page {page}, {baseItemIndex + index2 + 1}/{pageSize}
        </div>
        <div className="caption">{data.alt}</div>
        <a className="author" href={data.photographer_url} target="_blank">
          {data.photographer}
        </a>
      </ImageElement>,
      {
        index: factory(index2, arr.length).index,
        page,
        pageSize,
        items: fullItems,
        itemIndex: baseItemIndex + index2,
        initialHeight: (window.innerWidth / 3) * 4,
      },
    ]);
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

  const [currentPage, setCurrentPage] = useState(0);
  const [currentImage, setCurrentImage] = useState(0);
  const [currentTotalImage, setCurrentTotalImage] = useState(0);

  const onProgress: ProgressHandler<Data> = (current) => {
    setCurrentPage(current.data.page);
    setCurrentImage(current.data.itemIndex + 1);
    setCurrentTotalImage(current.data.pageSize);
  };

  return (
    <>
      <DynamicScroll
        className={className ? "real " + className : "real"}
        prependSpace={100}
        appendSpace={100}
        preloadRange={3000}
        maxLiveViewport={6000}
        prependContent="Loading..."
        appendContent="Loading..."
        onLoadMore={onLoadMore}
        onProgress={onProgress}
        onSelectAnchor={onSelectAnchor}
      />
      <div
        style={{
          position: "fixed",
          right: "1rem",
          bottom: "1rem",
          padding: "1rem",
          background: "rgba(0, 0, 0, 0.2)",
          color: "white",
          fontFamily: "monospace",
          whiteSpace: "pre-wrap",
        }}
      >
        Page: {currentPage}, {currentImage < 10 ? " " : ""}
        {currentImage} / {currentTotalImage}
      </div>
    </>
  );
}
