import { useCallback, useState } from 'react'
import './App.css'
import { Demo1 } from './Demo1'
import { Demo2 } from './Demo2'
import { Demo3 } from './Demo3'
import { Demo4 } from './Demo4'
import { Demo5 } from './Demo5'
import { Demo6 } from './Demo6'
import { Demo7 } from './Demo7'
import { Demo8 } from './Demo8'
import { Demo9 } from './Demo9'
import { Demo10 } from './Demo10'
import { DemoRealWorld1 } from './DemoRealWorld1'

function App() {
  const url = new URL(location.href)
  const tabId = url.searchParams.get('tab')

  let initialTab: `demo${string}`
  if (tabId?.startsWith('demo')) {
    initialTab = tabId as `demo${string}`
  } else {
    initialTab = 'demo1'
  }

  const [currentDemo, setCurrentDemoRaw] = useState<`demo${string}`>(initialTab)

  const setCurrentDemo = useCallback((tab: `demo${string}`) => {
    setCurrentDemoRaw(tab)
    const url = new URL(location.href)
    url.searchParams.set('tab', tab)
    history.replaceState(undefined, '', url)
  }, [])

  return (
    <div className="App">
      <div className="menu">
        <button onClick={() => setCurrentDemo('demo1')}>Simple</button>
        <button onClick={() => setCurrentDemo('demo2')}>Waterfall</button>
        <button onClick={() => setCurrentDemo('demo3')}>
          Manual resize callback
        </button>
        <button onClick={() => setCurrentDemo('demo4')}>
          Resize observer based resize
        </button>
        <button onClick={() => setCurrentDemo('demo5')}>
          Touch aware scroll anchor
        </button>
        <button onClick={() => setCurrentDemo('demo6')}>Resize aware</button>
        <button onClick={() => setCurrentDemo('demo7')}>Fixed end</button>
        <button onClick={() => setCurrentDemo('demo8')}>
          Fixed end with loading
        </button>
        <button onClick={() => setCurrentDemo('demo9')}>
          Fixed end started at end
        </button>
        <button onClick={() => setCurrentDemo('demo10')}>
          Fixed end started at start
        </button>
        <button onClick={() => setCurrentDemo('demor1')}>real world</button>
      </div>
      {currentDemo === 'demo1' && <Demo1 className="content" />}
      {currentDemo === 'demo2' && <Demo2 className="content" />}
      {currentDemo === 'demo3' && <Demo3 className="content" />}
      {currentDemo === 'demo4' && <Demo4 className="content" />}
      {currentDemo === 'demo5' && <Demo5 className="content" />}
      {currentDemo === 'demo6' && <Demo6 className="content" />}
      {currentDemo === 'demo7' && <Demo7 className="content" />}
      {currentDemo === 'demo8' && <Demo8 className="content" />}
      {currentDemo === 'demo9' && <Demo9 className="content" />}
      {currentDemo === 'demo10' && <Demo10 className="content" />}
      {currentDemo === 'demor1' && <DemoRealWorld1 className="content" />}
    </div>
  )
}

export default App
