import { useState } from "react";
import "./App.css";
import { Demo1 } from "./Demo1";
import { Demo2 } from "./Demo2";

function App() {
  const [currentDemo, setCurrentDemo] = useState<'demo1' | 'demo2'>('demo1')
  return (
    <div className="App">
      <div className="menu">
        <button onClick={() => setCurrentDemo('demo1')}>App1</button>
        <button onClick={() => setCurrentDemo('demo2')}>App2</button>
      </div>
      {currentDemo === 'demo1' && <Demo1 className="content" />}
      {currentDemo === 'demo2' && <Demo2 className="content" />}
    </div>
  );
}

export default App;
