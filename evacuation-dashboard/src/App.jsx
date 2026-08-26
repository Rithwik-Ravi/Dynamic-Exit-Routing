import React, { useState, useEffect } from 'react';
import './App.css';
import TopBar from './components/TopBar';
import MapCanvas from './components/MapCanvas';
import Inspector from './components/Inspector';
import BottomPanel from './components/BottomPanel';
import { useStore } from './engine/Store';

function App() {
  const initEngine = useStore(state => state.initEngine);

  useEffect(() => {
    initEngine();
  }, [initEngine]);

  return (
    <div className="app-container">
      <div className="top-bar">
        <TopBar />
      </div>
      <div className="map-area">
        <MapCanvas />
      </div>
      <div className="inspector-panel">
        <Inspector />
      </div>
      <div className="bottom-panel">
        <BottomPanel />
      </div>
    </div>
  );
}

export default App;
