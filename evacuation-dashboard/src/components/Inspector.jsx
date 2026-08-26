import React from 'react';
import { useStore } from '../engine/Store';
import { Info, Crosshair, Thermometer, Wind, AlertCircle, PlaySquare } from 'lucide-react';

export default function Inspector() {
  const { nodes, selectedNodeId, toggleExit } = useStore();
  const node = nodes.find(n => n.id === selectedNodeId);

  if (!node) {
    return (
      <div className="flex-col items-center justify-center text-muted" style={{ height: '100%' }}>
        <Crosshair size={32} style={{ marginBottom: '16px', opacity: 0.5 }} />
        <div>SELECT NODE TO INSPECT</div>
      </div>
    );
  }

  const isDanger = node.hazard_flag || node.blocked;

  return (
    <div className="flex-col" style={{ gap: '24px' }}>
      <div>
        <div className="panel-header mb-2 flex items-center gap-xs">
          <Info size={14} />
          NODE DIAGNOSTICS
        </div>
        <div className="flex justify-between items-center" style={{ marginBottom: '8px' }}>
          <div className="mono" style={{ fontSize: '1.5rem', color: isDanger ? 'var(--color-danger)' : 'var(--text-primary)' }}>
            {node.id}
          </div>
          <div className="mono text-secondary" style={{ fontSize: '0.75rem' }}>
            TYPE: {node.type.toUpperCase()}
          </div>
        </div>
        
        <div className="flex gap-sm">
          <div className={`mono ${node.active ? 'bg-safe' : 'bg-offline'}`} style={{ padding: '2px 6px', borderRadius: '2px', fontSize: '0.7rem', color: '#fff' }}>
            {node.active ? 'ACTIVE' : 'INACTIVE'}
          </div>
          {node.blocked && (
            <div className="mono bg-danger" style={{ padding: '2px 6px', borderRadius: '2px', fontSize: '0.7rem', color: '#fff' }}>
              BLOCKED
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="panel-header mb-2 flex items-center gap-xs">
          <Thermometer size={14} />
          SENSOR DATA
        </div>
        <div className="mono flex-col gap-xs" style={{ fontSize: '0.85rem' }}>
          <div className="flex justify-between"><span>TEMP:</span> <span className={node.temperature > 40 ? 'text-danger' : 'text-safe'}>{node.temperature}°C</span></div>
          <div className="flex justify-between"><span>SMOKE:</span> <span className={node.smoke_level > 20 ? 'text-danger' : 'text-safe'}>{node.smoke_level} ppm</span></div>
          <div className="flex justify-between"><span>GAS:</span> <span className={node.gas_level > 5 ? 'text-danger' : 'text-safe'}>{node.gas_level} LEL</span></div>
          <div className="flex justify-between"><span>CROWD_CNT:</span> <span className={node.crowd_count > 20 ? 'text-caution' : 'text-primary'}>{node.crowd_count} ppl</span></div>
          <div className="flex justify-between"><span>CONGESTION:</span> <span className={node.congestion_level > 0.7 ? 'text-danger' : node.congestion_level > 0.4 ? 'text-caution' : 'text-safe'}>{(node.congestion_level * 100).toFixed(0)}%</span></div>
          <div className="flex justify-between"><span>THROUGHPUT:</span> <span>{node.throughput} total</span></div>
          <div className="flex justify-between"><span>CONFIDENCE:</span> <span>{(node.confidence * 100).toFixed(1)}%</span></div>
        </div>
      </div>

      <div>
        <div className="panel-header mb-2 flex items-center gap-xs">
          <PlaySquare size={14} />
          ROUTING STATUS
        </div>
        <div className="mono flex-col gap-xs" style={{ fontSize: '0.85rem' }}>
          <div className="flex justify-between"><span>DIR_CMD:</span> <span className="text-accent">{node.display_direction.toUpperCase()}</span></div>
          <div className="flex justify-between"><span>NEXT_HOP:</span> <span>{node.next_hop || 'NONE'}</span></div>
          <div className="flex justify-between"><span>COST:</span> <span>{node.route_cost === Infinity ? 'INF' : node.route_cost.toFixed(1)}</span></div>
        </div>
      </div>

      <div>
        <div className="panel-header mb-2">OPERATOR OVERRIDE</div>
        <div className="flex-col gap-sm">
          {node.type === 'exit' ? (
            <button className={`button ${node.blocked ? 'primary' : 'danger'}`} onClick={() => toggleExit(node.id)}>
              {node.blocked ? 'OPEN EXIT' : 'CLOSE EXIT'}
            </button>
          ) : (
            <div className="text-muted" style={{fontSize: '0.75rem'}}>NO OVERRIDES AVAILABLE FOR THIS NODE TYPE</div>
          )}
        </div>
      </div>
      
    </div>
  );
}
