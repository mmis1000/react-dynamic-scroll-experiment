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

interface BoxDef extends DataBase {
  cols: number
  cells: BoxCell[]
  height: number
}

const getBoxHeight = () => {
  return 65 + Math.random() * 85;
}

const ROOT_BOX: BoxDef = {
  cols: COLS,
  cells: Array.from({ length: COLS }).map(() => ({type: 'other', top: 0, bottom: 0})),
  initialHeight: 0,
  index: 0,
  height: 0
}

export function Demo2 ({
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
        height: newRowHeight,
        index: box.index + 1,
        initialHeight: newRowHeight
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
        height: newRowHeight,
        index: box.index - 1,
        initialHeight: newRowHeight
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onPrepend: LoadHandler<BoxDef> = async (index, _props, _data, _signal) => {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY))
      const arr: Array<[ReactElement<DynamicChildElementProps>, BoxDef]> = []
      let currentBox: BoxDef = _data[0]?.data ?? { ...ROOT_BOX, index }

      for (let i = 0; i < COUNT; i++) {
        const color = ~~(360 * Math.random())
        const prevBox = getPrevBox(currentBox)
        currentBox = prevBox
        arr.unshift([<div className="item" style={{
          '--row-height': String(prevBox.height)
        } as unknown as CSSProperties} key={prevBox.index}>
          index: {prevBox.index} <br/>
          height: {prevBox.height}
          {prevBox.cells.map((cell, index) => cell.type === 'own' ? <div
            className="box"
            style={{
              background: `hsl(${color}deg 30% 60%)`,
              '--index': String(index),
              '--top': String(cell.top),
              '--height': String(cell.bottom - cell.top)
            } as unknown as CSSProperties}
            key={index}
          >
            ITEM
          </div> : null).filter(i => i != null)}
        </div>, prevBox])
      }
      return arr
    }
  
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const onAppend: LoadHandler<BoxDef> = async (index, _props, _data, _signal) => {
      await new Promise<void>(resolve => setTimeout(resolve, DELAY))
      const arr: Array<[ReactElement<DynamicChildElementProps>, BoxDef]> = []
      let currentBox: BoxDef = _data[_data.length - 1]?.data ?? { ...ROOT_BOX, index }

      for (let i = 0; i < COUNT; i++) {
        const color = ~~(360 * Math.random())
        const nextBox = getNextBox(currentBox)
        currentBox = nextBox
        arr.push([<div className="item" style={{
          '--row-height': String(nextBox.height)
        } as unknown as CSSProperties} key={nextBox.index}>
          index: {nextBox.index} <br/>
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
            ITEM
          </div> : null).filter(i => i != null)}
        </div>, nextBox])
      }
      return arr
    }
  
    return <DynamicScroll style={{
      '--cols': String(COLS)
    } as unknown as CSSProperties} className={'demo2' + (className ? `  ${className}` : '')} prependSpace={5000} appendSpace={5000} onPrepend={onPrepend} onAppend={onAppend}/>
}