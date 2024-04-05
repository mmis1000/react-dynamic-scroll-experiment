import { CSSProperties, ReactNode, forwardRef, useRef, useState } from 'react'
import {
  DynamicScroll,
  LoadHandler,
  DataBase,
  ProgressHandler,
} from './DynamicScroll'
import './DemoRealWorld1.css'
import { END_OF_STREAM } from './DynamicScrollUtils'

const COUNT = 10
const DEFAULT_HEIGHT = 700

const API_BASE = 'https://api.pexels.com/v1/curated'
const API_KEY = 'S6Q7YlUQjfI3zdss4TANCEKEs2FuYhLz6Bi4GT5mGNFJfN6dfnqYL02y'
interface PhotoItem {
  src: { medium: string }
  alt: string
  photographer: string
  photographer_url: string
  avg_color: string
}
const getData = async (signal: AbortSignal, page: number, pageSize: number) => {
  const request = new Request(`${API_BASE}?page=${page}&per_page=${pageSize}`, {
    headers: {
      Authorization: API_KEY,
    },
    signal,
  })
  const res = await fetch(request)
  const json = await res.json()
  return json as { photos: PhotoItem[] }
}

interface Data extends DataBase {
  /** 1 index */
  page: number
  pageSize: number
  itemIndex: number
  items: PhotoItem[]
}

const ImageElement = forwardRef<
  HTMLDivElement,
  {
    style?: CSSProperties
    className?: string
    children?: ReactNode
    data: PhotoItem
  }
>(({ style, className, children, data }, ref) => {
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      ref={ref}
      style={{
        ...(style ?? {}),
        display: 'flex',
        justifyContent: 'stretch',
        flexDirection: 'column',
      }}
      className={className ? 'item ' + className : 'item'}
    >
      <img
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        src={data.src.medium}
        style={{ width: '100%', flex: '0 0 auto' }}
        width={400}
        height={loaded ? undefined : 700}
      />
      {children}
    </div>
  )
})

const useInitialPageParam = function <T>(
  name: string,
  defaultValue: string,
  transform: (str: string) => T
) {
  const url = new URL(location.href)
  const initialPageStr = url.searchParams.get(name) ?? defaultValue
  const initialPageParsed = transform(initialPageStr)
  const initialPageRefed = useRef(initialPageParsed)
  return initialPageRefed.current
}

export function DemoRealWorld1({ className }: { className?: string }) {
  const initialPage = useInitialPageParam('page', '1', (str) =>
    /^\d+$/.test(str) ? Number(str) : 1
  )
  const initialScroll = useInitialPageParam('scroll', '0', (str) =>
    /^\d+(\.\d+)?$/.test(str) ? Number(str) : 0
  )
  const initialItemIndex = useInitialPageParam('item', '1', (str) =>
    /^\d+$/.test(str) ? Number(str) - 1 : 0
  )

  const initialPrependSpace = useRef(initialPage * DEFAULT_HEIGHT * COUNT)

  const onLoadMore: LoadHandler<Data> = async (
    direction,
    factory,
    data,
    _signal
  ) => {
    const bound = direction === 'prev' ? data[0] : data[data.length - 1]

    let items: PhotoItem[]
    let fullItems: PhotoItem[]
    let page: number
    let pageSize: number
    let baseItemIndex: number

    if (bound == null) {
      if (direction === 'prev') {
        if (initialItemIndex !== 0) {
          page = initialPage
          if (page < 1) {
            return END_OF_STREAM
          } else {
            pageSize = COUNT
            const { photos } = await getData(_signal, page, COUNT)
            fullItems = photos
            items = photos.slice(0, initialItemIndex)
            baseItemIndex = 0
          }
        } else {
          page = initialPage - 1
          if (page < 1) {
            return END_OF_STREAM
          } else {
            pageSize = COUNT
            const { photos } = await getData(_signal, page, COUNT)
            fullItems = items = photos
            baseItemIndex = 0
          }
        }
      } else {
        page = initialPage
        pageSize = COUNT
        const { photos } = await getData(_signal, page, COUNT)
        fullItems = photos
        items = photos.slice(initialItemIndex, photos.length)
        baseItemIndex = initialItemIndex
      }
    } else if (
      direction === 'prev'
        ? bound.data.itemIndex !== 0
        : bound.data.itemIndex !== bound.data.pageSize - 1
    ) {
      // print remaining items in data field
      fullItems = bound.data.items
      items =
        direction === 'prev'
          ? bound.data.items.slice(0, bound.data.itemIndex)
          : bound.data.items.slice(bound.data.itemIndex + 1)
      page = bound.data.page
      pageSize = bound.data.pageSize
      baseItemIndex = direction === 'prev' ? 0 : bound.data.itemIndex + 1
    } else {
      // fetch new data
      const currentPage =
        direction === 'prev' ? bound.data.page - 1 : bound.data.page + 1

      if (currentPage < 1) return END_OF_STREAM

      const { photos } = await getData(
        _signal,
        currentPage,
        bound.data.pageSize
      )
      fullItems = items = photos
      page = currentPage
      pageSize = bound.data.pageSize
      baseItemIndex = 0
    }

    if (items.length === 0) {
      return END_OF_STREAM
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
    })
  }

  const [currentPage, setCurrentPage] = useState(0)
  const [currentImage, setCurrentImage] = useState(0)
  const [currentTotalImage, setCurrentTotalImage] = useState(0)

  const rafId = useRef<null | ReturnType<typeof setTimeout>>(null)

  const onProgress: ProgressHandler<Data> = (current, index, offset, full) => {
    if (current == null) {
      return
    }

    console.log(current, index, offset, full)

    if (rafId.current != null) {
      clearTimeout(rafId.current)
    }

    const url = new URL(location.href)
    if (
      String(current.data.itemIndex + 1) !== url.searchParams.get('item') ||
      String(current.data.page) !== url.searchParams.get('page')
    ) {
      url.searchParams.set('page', String(current.data.page))
      url.searchParams.set('item', String(current.data.itemIndex + 1))
      url.searchParams.set('scroll', String(offset))
      history.replaceState(undefined, '', url)
    } else {
      rafId.current = setTimeout(() => {
        if (String(offset) !== url.searchParams.get('offset')) {
          url.searchParams.set('page', String(current.data.page))
          url.searchParams.set('item', String(current.data.itemIndex + 1))
          url.searchParams.set('scroll', String(offset))
          history.replaceState(undefined, '', url)
        }
      }, 100)
    }

    setCurrentPage(current.data.page)
    setCurrentImage(current.data.itemIndex + 1)
    setCurrentTotalImage(current.data.pageSize)
  }

  return (
    <>
      <DynamicScroll
        className={className ? 'real ' + className : 'real'}
        initialHeadLocked={true}
        initialOffset={initialScroll}
        initialPrependSpace={initialPrependSpace.current}
        prependSpace={100}
        appendSpace={100}
        preloadRange={3000}
        maxLiveViewport={6000}
        prependContent={
          <div
            style={{
              height: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-end',
            }}
          >
            "Loading..."
          </div>
        }
        appendContent={
          <div
            style={{
              height: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-start',
            }}
          >
            "Loading..."
          </div>
        }
        onLoadMore={onLoadMore}
        onProgress={onProgress}
        onSelectAnchor={'touch'}
      />
      <div
        style={{
          position: 'fixed',
          right: '1rem',
          bottom: '1rem',
          padding: '1rem',
          background: 'rgba(0, 0, 0, 0.2)',
          color: 'white',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
        }}
      >
        Page: {currentPage}, {currentImage < 10 ? ' ' : ''}
        {currentImage} / {currentTotalImage}
      </div>
    </>
  )
}
