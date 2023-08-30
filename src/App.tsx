import { useState } from "react";
import "./App.css";
import { Demo1 } from "./Demo1";
import { Demo2 } from "./Demo2";
import { Demo3 } from "./Demo3";
import { Demo4 } from "./Demo4";
import { Demo5 } from "./Demo5";
import { Demo6 } from "./Demo6";
import { Demo7 } from "./Demo7";

function App() {
  const [currentDemo, setCurrentDemo] = useState<'demo1' | 'demo2' | 'demo3' | 'demo4' | 'demo5' | 'demo6' | 'demo7'>('demo1')
  return (
    <div className="App">
      <div className="menu">
        <button onClick={() => setCurrentDemo('demo1')}>Simple</button>
        <button onClick={() => setCurrentDemo('demo2')}>Waterfall</button>
        <button onClick={() => setCurrentDemo('demo3')}>Manual resize callback</button>
        <button onClick={() => setCurrentDemo('demo4')}>Resize observer based resize</button>
        <button onClick={() => setCurrentDemo('demo5')}>Touch aware scroll anchor</button>
        <button onClick={() => setCurrentDemo('demo6')}>Resize aware</button>
        <button onClick={() => setCurrentDemo('demo7')}>Fixed end</button>
      </div>
      {currentDemo === 'demo1' && <Demo1 className="content" />}
      {currentDemo === 'demo2' && <Demo2 className="content" />}
      {currentDemo === 'demo3' && <Demo3 className="content" />}
      {currentDemo === 'demo4' && <Demo4 className="content" />}
      {currentDemo === 'demo5' && <Demo5 className="content" />}
      {currentDemo === 'demo6' && <Demo6 className="content" />}
      {currentDemo === 'demo7' && <Demo7 className="content" />}
    </div>
  );
}

export default App;
