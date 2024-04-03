import { CSSProperties, ReactElement } from "react"
import { DynamicScroll, DynamicChildElementProps, LoadHandler, DataBase } from "./DynamicScroll"
import './Demo2.css'

const COLS = 8
const COUNT = 100
const DELAY = 100

interface BoxCellBase {
  type: string
}

interface BoxCellOwn extends BoxCellBase {
  type: 'own'
  top: number
  bottom: number
}

interface BoxCellOther extends BoxCellBase {
  type: 'other'
  top: number
  bottom: number
}

type BoxCell = BoxCellOwn | BoxCellOther

interface BoxDef {
  cols: number
  cells: BoxCell[]
  height: number
}

const getBoxHeight = () => {
  return 65 + Math.random() * 85;
}

const ROOT_BOX: BoxDef = {
  cols: COLS,
  cells: Array.from({ length: COLS }).map(() => ({ type: 'other', top: 0, bottom: 0 })),
  height: 0
}

export function Demo2({
  className
}: { className?: string }) {
  const getNextBox = (box: BoxDef): BoxDef => {
    const rebasedPositions: number[] = box.cells.map(i => {
      return i.bottom - box.height
    })

    let shortestIndex: number = -1
    let shortest: number = Infinity

    for (let i = 0; i < rebasedPositions.length; i++) {
      if (rebasedPositions[i] < shortest) {
        shortestIndex = i
        shortest = rebasedPositions[i]
      }
    }

    if (shortestIndex === -1) {
      throw new Error('?')
    }

    const nextBoxHeight = getBoxHeight()

    const newCells: BoxCell[] = rebasedPositions.map((p, index) => {
      if (index === shortestIndex) {
        return {
          type: 'own',
          top: p,
          bottom: p + nextBoxHeight
        }
      } else {
        return {
          type: 'other',
          top: p,
          bottom: p
        }
      }
    })

    const newPositions = newCells.map(i => i.bottom)
    const newRowHeight = Math.max(0, ...newPositions)
    return {
      cols: box.cols,
      cells: newCells,
      height: newRowHeight
    }
  }
  const getPrevBox = (box: BoxDef): BoxDef => {
    const rebasedPositions: number[] = box.cells.map(i => {
      return i.top
    })

    let shortestIndex: number = -1
    let shortest: number = -Infinity

    for (let i = 0; i < rebasedPositions.length; i++) {
      if (rebasedPositions[i] > shortest) {
        shortestIndex = i
        shortest = rebasedPositions[i]
      }
    }

    if (shortestIndex === -1) {
      throw new Error('?')
    }

    const nextBoxHeight = getBoxHeight()

    const tempCells: BoxCell[] = rebasedPositions.map((p, index) => {
      if (index === shortestIndex) {
        return {
          type: 'own',
          top: p - nextBoxHeight,
          bottom: p
        }
      } else {
        return {
          type: 'other',
          top: p,
          bottom: p
        }
      }
    })
    // a negative number or 0
    const newBasePos = Math.min(0, ...tempCells.map(i => i.top))
    const newRowHeight = -newBasePos
    const newCells = tempCells.map(i => ({
      ...i,
      top: i.top + newRowHeight,
      bottom: i.bottom + newRowHeight
    }))

    return {
      cols: box.cols,
      cells: newCells,
      height: newRowHeight
    }
  }

  const onLoadMore: LoadHandler<BoxDef & DataBase> = async (direction, factory, data, _signal) => {
    await new Promise<void>(resolve => setTimeout(resolve, DELAY))

    const arr: Array<[ReactElement<DynamicChildElementProps>, BoxDef & DataBase]> = []
    let currentBox: BoxDef = (direction === 'prev' ? data[0]?.data : data[data.length - 1]?.data) ?? { ...ROOT_BOX }

    for (let i = 0; i < COUNT; i++) {
      const color = ~~(360 * Math.random())
      const nextBox = direction === 'prev' ? getPrevBox(currentBox) : getNextBox(currentBox)

      currentBox = nextBox

      const entryInfo = direction === 'prev' ? factory(COUNT - i - 1, COUNT) : factory(i, COUNT)
  
      const entry: [ReactElement<DynamicChildElementProps>, BoxDef & DataBase] = [<div className="item" style={{
        '--row-height': String(nextBox.height)
      } as unknown as CSSProperties} key={entryInfo.index}>
        index: {entryInfo.index} <br />
        height: {nextBox.height}
        {nextBox.cells.map((cell, index) => cell.type === 'own' ? <div
          className="box"
          style={{
            background: `hsl(${color}deg 30% 60%)`,
            '--index': String(index),
            '--top': String(cell.top),
            '--height': String(cell.bottom - cell.top)
          } as unknown as CSSProperties}
          key={index}
        >
          ITEM {entryInfo.index}
        </div> : null).filter(i => i != null)}
      </div>, {
        ...nextBox,
        index: entryInfo.index,
        initialHeight: nextBox.height
      }]

      if (direction === 'prev') {
        arr.unshift(entry)
      } else {
        arr.push(entry)
      }
    }
    return arr
  }

  return <DynamicScroll style={{
    '--cols': String(COLS)
  } as unknown as CSSProperties} className={'demo2' + (className ? `  ${className}` : '')} prependSpace={5000} appendSpace={5000} onLoadMore={onLoadMore} />
}