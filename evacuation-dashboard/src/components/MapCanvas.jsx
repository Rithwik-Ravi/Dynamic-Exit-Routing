import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../engine/Store';
import { Flame, CloudFog, Ban } from 'lucide-react';

export default function MapCanvas() {
  const { nodes, edges, rooms, hazards, selectedNodeId, selectNode, evacuees, addHazard, incrementThroughput } = useStore();
  const [hoverNode, setHoverNode] = useState(null);
  
  // Local state for animation
  const [localEvacuees, setLocalEvacuees] = useState([]);
  const requestRef = useRef();

  useEffect(() => {
    // When global evacuees array changes (e.g. simulation start), copy to local
    setLocalEvacuees(evacuees);
  }, [evacuees]);

  // Animation Loop for moving dots
  const updatePhysics = () => {
    setLocalEvacuees(prev => {
      let changed = false;
      const currentNodes = useStore.getState().nodes;
      
      const nextEvacuees = prev.map(evac => {
        if (!evac.targetNodeId) return evac;
        const targetNode = currentNodes.find(n => n.id === evac.targetNodeId);
        if (!targetNode) return evac;

        const dx = targetNode.x - evac.x;
        const dy = targetNode.y - evac.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5) { // Reached target
          if (targetNode.type === 'exit' || !targetNode.next_hop) {
             // Reached exit
             incrementThroughput(targetNode.id);
             return null; // Remove this evacuee
          } else {
             // Move to next hop
             return { ...evac, currentNodeId: targetNode.id, targetNodeId: targetNode.next_hop, x: targetNode.x, y: targetNode.y };
          }
        } else {
          // Move towards target
          const vx = (dx / dist) * evac.speed;
          const vy = (dy / dist) * evac.speed;
          return { ...evac, x: evac.x + vx, y: evac.y + vy };
        }
      }).filter(Boolean);
      
      return nextEvacuees;
    });
    requestRef.current = requestAnimationFrame(updatePhysics);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(requestRef.current);
  }, []); 

  const getEdgeCoords = (sourceId, targetId) => {
    const s = nodes.find(n => n.id === sourceId);
    const t = nodes.find(n => n.id === targetId);
    if (!s || !t) return { x1: 0, y1: 0, x2: 0, y2: 0 };
    return { x1: s.x, y1: s.y, x2: t.x, y2: t.y };
  };

  const handleDragStart = (e, hazardType) => {
    e.dataTransfer.setData('hazardType', hazardType);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const hazardType = e.dataTransfer.getData('hazardType');
    
    // Convert screen drop coords to SVG coords
    const svgBounds = e.currentTarget.getBoundingClientRect();
    const scaleX = 850 / svgBounds.width;
    const scaleY = 650 / svgBounds.height;
    
    const dropX = (e.clientX - svgBounds.left) * scaleX;
    const dropY = (e.clientY - svgBounds.top) * scaleY;

    addHazard(dropX, dropY, hazardType);
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // necessary to allow dropping
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      
      {/* Hazard Toolbox overlay */}
      <div className="panel" style={{ position: 'absolute', top: 16, right: 16, padding: '8px', zIndex: 10, display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span className="mono text-muted" style={{ fontSize: '10px', marginRight: '8px' }}>DRAG HAZARD TO DEPLOY</span>
        <div 
          draggable 
          onDragStart={(e) => handleDragStart(e, 'fire')}
          style={{ padding: '4px', background: 'var(--color-danger-dim)', borderRadius: '4px', cursor: 'grab', border: '1px solid var(--color-danger)' }}
        >
          <Flame size={16} color="var(--color-danger)" />
        </div>
        <div 
          draggable 
          onDragStart={(e) => handleDragStart(e, 'smoke')}
          style={{ padding: '4px', background: 'var(--color-caution-dim)', borderRadius: '4px', cursor: 'grab', border: '1px solid var(--color-caution)' }}
        >
          <CloudFog size={16} color="var(--color-caution)" />
        </div>
      </div>

      <svg 
        width="100%" height="100%" 
        viewBox="0 0 850 650"
        style={{ position: 'absolute', top: 0, left: 0 }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-safe)" />
          </marker>
        </defs>

        {/* Draw Rooms (Background) */}
        {rooms && rooms.map(room => (
          <g key={room.id}>
            <rect 
              x={room.x} y={room.y} width={room.w} height={room.h}
              fill="rgba(48, 54, 61, 0.4)" 
              stroke="var(--text-muted)" 
              strokeWidth="2"
            />
            <text 
              x={room.x + 8} y={room.y + 20} 
              fill="var(--text-secondary)" 
              className="mono" 
              fontSize="14"
              fontWeight="bold"
            >
              {room.label}
            </text>
          </g>
        ))}

        {/* Draw Edges */}
        {edges.map((edge, i) => {
          const coords = getEdgeCoords(edge.source, edge.target);
          return (
            <line 
              key={`e-${i}`} 
              x1={coords.x1} y1={coords.y1} x2={coords.x2} y2={coords.y2} 
              stroke={'var(--border-color)'}
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}

        {/* Draw Coordinate Hazards */}
        {hazards && hazards.map(hazard => (
          <g key={hazard.id} style={{ pointerEvents: 'none' }}>
            <circle 
              cx={hazard.x} cy={hazard.y} r={hazard.radius} 
              fill={hazard.type === 'fire' ? "rgba(248, 81, 73, 0.2)" : "rgba(210, 153, 34, 0.2)"} 
              stroke={hazard.type === 'fire' ? "var(--color-danger)" : "var(--color-caution)"} 
              strokeDasharray="4 4" 
            />
            {hazard.type === 'fire' ? (
              <Flame size={24} color="var(--color-danger)" x={hazard.x - 12} y={hazard.y - 12} />
            ) : (
              <CloudFog size={24} color="var(--color-caution)" x={hazard.x - 12} y={hazard.y - 12} />
            )}
          </g>
        ))}

        {/* Draw Animated Direction Arrows (Current Route/Flow) */}
        {nodes.map(node => {
          if (!node.next_hop) return null;
          const target = nodes.find(n => n.id === node.next_hop);
          if (!target) return null;
          
          return (
            <line
              key={`dir-${node.id}`}
              x1={node.x} y1={node.y} x2={target.x} y2={target.y}
              stroke="var(--color-safe)"
              strokeWidth={2}
              markerEnd="url(#arrowhead)"
              strokeDasharray="5, 5"
              style={{ animation: 'dash 1s linear infinite' }}
            />
          );
        })}

        {/* Draw Nodes */}
        {nodes.map(node => {
          const isSelected = selectedNodeId === node.id;
          const isDanger = node.blocked;
          
          let fill = 'var(--bg-panel)';
          let stroke = 'var(--border-color)';
          
          if (node.type === 'exit') {
            stroke = node.blocked ? 'var(--color-danger)' : 'var(--color-safe)';
            fill = node.blocked ? 'var(--color-danger-dim)' : 'var(--color-safe-dim)';
          } else if (isDanger) {
            stroke = 'var(--color-danger)';
            fill = 'var(--color-danger-dim)';
          }

          if (isSelected) { stroke = 'var(--color-accent)'; }

          return (
            <g 
              key={node.id} 
              transform={`translate(${node.x}, ${node.y})`}
              onClick={() => selectNode(node.id)}
              onMouseEnter={() => setHoverNode(node)}
              onMouseLeave={() => setHoverNode(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle 
                r={16} 
                fill={fill}
                stroke={stroke}
                strokeWidth={isSelected ? 4 : 2}
                style={{ transition: 'all 0.2s ease' }}
              />
              <text 
                y={-24} 
                textAnchor="middle" 
                fill={isSelected ? 'var(--color-accent)' : 'var(--text-secondary)'}
                className="mono"
                fontSize="12"
                fontWeight="bold"
              >
                {node.id}
              </text>
              {node.blocked && <Ban size={16} color="var(--color-danger)" x={-8} y={-8} />}
            </g>
          );
        })}

        {/* Draw Evacuees (Moving Red Dots) */}
        {localEvacuees.map(evac => (
          <circle key={evac.id} cx={evac.x} cy={evac.y} r={4} fill={evac.color || "#f85149"} style={{ filter: 'drop-shadow(0 0 2px rgba(248,81,73,0.5))' }} />
        ))}
      </svg>
      
      <style>{`
        @keyframes dash {
          to { stroke-dashoffset: -10; }
        }
      `}</style>

      {/* Hover Tooltip */}
      {hoverNode && (
        <div 
          className="panel mono" 
          style={{ 
            position: 'absolute', 
            // Rough screen coords mapping for tooltip
            left: '50%', 
            top: 20,
            transform: 'translateX(-50%)',
            padding: 'var(--spacing-xs) var(--spacing-sm)',
            fontSize: '0.75rem',
            zIndex: 10,
            pointerEvents: 'none',
            boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
          }}
        >
          <div><strong>{hoverNode.id}</strong> ({hoverNode.type})</div>
          <div>THROUGHPUT: {hoverNode.throughput}</div>
          <div>DIR: <span className="text-accent">{hoverNode.display_direction}</span></div>
        </div>
      )}
    </div>
  );
}
