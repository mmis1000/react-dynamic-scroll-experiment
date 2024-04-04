import { CSSProperties, ReactNode, forwardRef, useRef, useState } from "react";
import {
  DynamicScroll,
  LoadHandler, DataBase,
  ProgressHandler
} from "./DynamicScroll";
import "./DemoRealWorld1.css";
import { END_OF_STREAM } from "./DynamicScrollUtils";

const COUNT = 10;
const DEFAULT_HEIGHT = 700

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
      style={{ ...(style ?? {}), display: "flex", justifyContent: "stretch", flexDirection: "column" }}
      className={className ? "item " + className : "item"}
    >
      <img
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        src={data.src.medium}
        style={{ width: "100%", flex: "0 0 auto" }}
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
  const initialPrependSpace = useRef(initialPageRefed.current * DEFAULT_HEIGHT * COUNT)

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
        page = initialPageRefed.current - 1;
        if (page < 1) {
          return END_OF_STREAM;
        } else {
          pageSize = COUNT;
          const { photos } = await getData(_signal, page, COUNT);
          fullItems = items = photos;
          baseItemIndex = 0;
        }
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

    return items.map((data, index2, arr) => {
      const entry = factory(index2, arr.length)
      return [
        <ImageElement
          ref={entry.resizeRef}
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
          index: entry.index,
          page,
          pageSize,
          items: fullItems,
          itemIndex: baseItemIndex + index2,
          initialHeight: (window.innerWidth / 3) * 4,
        },
      ]
    });
  };

  const [currentPage, setCurrentPage] = useState(0);
  const [currentImage, setCurrentImage] = useState(0);
  const [currentTotalImage, setCurrentTotalImage] = useState(0);

  const onProgress: ProgressHandler<Data> = (current) => {
    if (current == null) {
      return
    }
    setCurrentPage(current.data.page);
    setCurrentImage(current.data.itemIndex + 1);
    setCurrentTotalImage(current.data.pageSize);
  };

  return (
    <>
      <DynamicScroll
        className={className ? "real " + className : "real"}
        initialHeadLocked={true}
        initialPrependSpace={initialPrependSpace.current}

        prependSpace={100}
        appendSpace={100}
        preloadRange={3000}
        maxLiveViewport={6000}
        prependContent={<div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>"Loading..."</div>}
        appendContent={<div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>"Loading..."</div>}
        onLoadMore={onLoadMore}
        onProgress={onProgress}
        onSelectAnchor={'touch'}
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
