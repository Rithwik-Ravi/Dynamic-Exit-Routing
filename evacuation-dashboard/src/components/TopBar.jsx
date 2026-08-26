import React from 'react';
import { useStore } from '../engine/Store';
import { Activity, ShieldAlert, Cpu, Route, Map as MapIcon } from 'lucide-react';

export default function TopBar() {
  const { systemStatus, currentFloor, isSimulationMode, autoRoutingEnabled, toggleAutoRouting, emergencyMode, setEmergencyMode, startSimulation, simulationRunning } = useStore();

  return (
    <>
      <div className="flex items-center gap-md">
        <div className="flex items-center gap-xs">
          <Activity size={18} className={systemStatus === 'ONLINE' ? 'text-safe' : 'text-danger'} />
          <span className="mono" style={{ fontWeight: 'bold' }}>SCADA_CORE</span>
        </div>
        <div className="flex items-center gap-xs text-secondary mono" style={{ fontSize: '0.85rem' }}>
          <MapIcon size={14} />
          <span>{currentFloor}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-md">
        <div className="flex items-center gap-xs text-secondary mono" style={{ fontSize: '0.8rem' }}>
          <Cpu size={14} />
          <span>{isSimulationMode ? 'SIMULATION_ACTIVE' : 'LIVE_FEED'}</span>
        </div>

        <button 
          className={`button ${autoRoutingEnabled ? 'primary' : ''}`}
          onClick={toggleAutoRouting}
        >
          <div className="flex items-center gap-xs">
            <Route size={14} />
            {autoRoutingEnabled ? 'AUTO-ROUTING ON' : 'AUTO-ROUTING OFF'}
          </div>
        </button>

        <button 
          className={`button ${emergencyMode ? 'danger' : ''}`}
          onClick={() => setEmergencyMode(!emergencyMode)}
        >
          <div className="flex items-center gap-xs">
            <ShieldAlert size={14} />
            {emergencyMode ? 'EMERGENCY OVERRIDE' : 'STANDARD OP'}
          </div>
        </button>

        {!simulationRunning && (
          <button 
            className="button primary"
            onClick={startSimulation}
            style={{ marginLeft: '16px' }}
          >
            START SIMULATION
          </button>
        )}
      </div>
    </>
  );
}
