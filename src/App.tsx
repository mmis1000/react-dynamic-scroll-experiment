import { useState } from "react";
import "./App.css";
import { Demo1 } from "./Demo1";
import { Demo2 } from "./Demo2";
import { Demo3 } from "./Demo3";

function App() {
  const [currentDemo, setCurrentDemo] = useState<'demo1' | 'demo2' | 'demo3'>('demo1')
  return (
    <div className="App">
      <div className="menu">
        <button onClick={() => setCurrentDemo('demo1')}>App1</button>
        <button onClick={() => setCurrentDemo('demo2')}>App2</button>
        <button onClick={() => setCurrentDemo('demo3')}>App3</button>
      </div>
      {currentDemo === 'demo1' && <Demo1 className="content" />}
      {currentDemo === 'demo2' && <Demo2 className="content" />}
      {currentDemo === 'demo3' && <Demo3 className="content" />}
    </div>
  );
}

export default App;
