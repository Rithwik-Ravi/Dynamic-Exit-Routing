import React from 'react';
import { useStore } from '../engine/Store';
import { Terminal, RadioTower, AlertTriangle } from 'lucide-react';

export default function BottomPanel() {
  const { logs, commandQueue, nodes } = useStore();
  const alerts = nodes.filter(n => n.hazard_flag || n.warning_level === 'critical');

  return (
    <>
      <div className="panel-section">
        <div className="panel-header flex items-center gap-xs">
          <Terminal size={12} />
          SYSTEM EVENT LOG
        </div>
        <div className="log-list">
          {logs.map(log => (
            <div key={log.id} className="log-item flex justify-between">
              <span className="text-secondary">[{log.time}]</span>
              <span style={{flex: 1, marginLeft: '8px'}}>{log.msg}</span>
            </div>
          ))}
          {logs.length === 0 && <div className="text-muted">No events recorded.</div>}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-header flex items-center gap-xs">
          <RadioTower size={12} />
          NODE COMMAND QUEUE
        </div>
        <div className="log-list">
          {commandQueue.map(cmd => (
            <div key={cmd.id} className="log-item flex justify-between">
              <span className="text-accent">CMD_OUT_N{cmd.nodeId}</span>
              <span className="text-secondary">{JSON.stringify(cmd.payload)}</span>
            </div>
          ))}
          {commandQueue.length === 0 && <div className="text-muted">Queue empty.</div>}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-header flex items-center gap-xs">
          <AlertTriangle size={12} />
          ACTIVE ALERTS
        </div>
        <div className="log-list">
          {alerts.map(n => (
            <div key={`alert-${n.id}`} className="log-item text-danger">
              [CRITICAL] {n.hazard_type?.toUpperCase() || 'UNKNOWN HAZARD'} detected at Node {n.id}
            </div>
          ))}
          {alerts.length === 0 && <div className="text-safe">No active alerts. System stable.</div>}
        </div>
      </div>
    </>
  );
}
