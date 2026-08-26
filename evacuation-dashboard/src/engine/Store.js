import { create } from 'zustand';
import { GraphEngine } from './Graph';

// Floor structural definitions (for drawing the map background)
export const initialRooms = [
  // North side rooms
  { id: 'R_N1', x: 50, y: 50, w: 200, h: 120, label: 'Sector A1' },
  { id: 'R_N2', x: 300, y: 50, w: 200, h: 120, label: 'Sector A2' },
  { id: 'R_N3', x: 550, y: 50, w: 200, h: 120, label: 'Sector A3' },
  
  // Center block (solid structure, no entry)
  { id: 'CORE', x: 300, y: 250, w: 200, h: 150, label: 'Central Core (Restricted)' },

  // South side rooms
  { id: 'R_S1', x: 50, y: 480, w: 200, h: 120, label: 'Sector B1' },
  { id: 'R_S2', x: 300, y: 480, w: 200, h: 120, label: 'Sector B2' },
  { id: 'R_S3', x: 550, y: 480, w: 200, h: 120, label: 'Sector B3' },
];

// Base node structure
const baseNode = { active: true, blocked: false, hazard_flag: false, hazard_type: null, crowd_count: 0, throughput: 0, congestion_level: 0, temperature: 22, gas_level: 0, smoke_level: 0, air_quality: 98, confidence: 0.99, display_direction: 'stop', audio_instruction: 'Standby', next_hop: null, route_cost: 0, last_update: Date.now(), warning_level: 'none' };

// Expanded floor plan nodes (ONLY IN CORRIDORS)
const initialNodes = [
  // North Corridor (y = 210)
  { ...baseNode, id: 'E_NW', type: 'exit', x: 50, y: 210, display_direction: 'exit', audio_instruction: 'Exit West' },
  { ...baseNode, id: 'N1', type: 'corridor', x: 150, y: 210, crowd_count: 12, congestion_level: 0.1, throughput: 310 },
  { ...baseNode, id: 'J1', type: 'junction', x: 275, y: 210, crowd_count: 45, congestion_level: 0.6, throughput: 850 },
  { ...baseNode, id: 'N2', type: 'corridor', x: 400, y: 210, crowd_count: 5, congestion_level: 0.05, throughput: 420 },
  { ...baseNode, id: 'J2', type: 'junction', x: 525, y: 210, crowd_count: 22, congestion_level: 0.3, throughput: 610 },
  { ...baseNode, id: 'N3', type: 'corridor', x: 650, y: 210, crowd_count: 8, congestion_level: 0.1, throughput: 290 },
  { ...baseNode, id: 'E_NE', type: 'exit', x: 750, y: 210, display_direction: 'exit', audio_instruction: 'Exit East' },

  // South Corridor (y = 440)
  { ...baseNode, id: 'E_SW', type: 'exit', x: 50, y: 440, display_direction: 'exit', audio_instruction: 'Exit West' },
  { ...baseNode, id: 'N4', type: 'corridor', x: 150, y: 440, crowd_count: 18, congestion_level: 0.2, throughput: 210 },
  { ...baseNode, id: 'J3', type: 'junction', x: 275, y: 440, crowd_count: 60, congestion_level: 0.8, throughput: 1100 },
  { ...baseNode, id: 'N5', type: 'corridor', x: 400, y: 440, crowd_count: 2, congestion_level: 0.0, throughput: 150 },
  { ...baseNode, id: 'J4', type: 'junction', x: 525, y: 440, crowd_count: 15, congestion_level: 0.2, throughput: 320 },
  { ...baseNode, id: 'N6', type: 'corridor', x: 650, y: 440, crowd_count: 0, congestion_level: 0.0, throughput: 50 },
  { ...baseNode, id: 'E_SE', type: 'exit', x: 750, y: 440, display_direction: 'exit', audio_instruction: 'Exit East' },

  // Vertical Connecting Corridors (Midpoints)
  { ...baseNode, id: 'M1', type: 'corridor', x: 275, y: 325, crowd_count: 30, congestion_level: 0.4, throughput: 670 },
  { ...baseNode, id: 'M2', type: 'corridor', x: 525, y: 325, crowd_count: 5, congestion_level: 0.1, throughput: 190 },
];

const initialEdges = [
  // North Corridor
  { source: 'E_NW', target: 'N1', weight: 100 },
  { source: 'N1', target: 'J1', weight: 125 },
  { source: 'J1', target: 'N2', weight: 125 },
  { source: 'N2', target: 'J2', weight: 125 },
  { source: 'J2', target: 'N3', weight: 125 },
  { source: 'N3', target: 'E_NE', weight: 100 },

  // South Corridor
  { source: 'E_SW', target: 'N4', weight: 100 },
  { source: 'N4', target: 'J3', weight: 125 },
  { source: 'J3', target: 'N5', weight: 125 },
  { source: 'N5', target: 'J4', weight: 125 },
  { source: 'J4', target: 'N6', weight: 125 },
  { source: 'N6', target: 'E_SE', weight: 100 },

  // Vertical Connections
  { source: 'J1', target: 'M1', weight: 115 },
  { source: 'M1', target: 'J3', weight: 115 },
  { source: 'J2', target: 'M2', weight: 115 },
  { source: 'M2', target: 'J4', weight: 115 },
];

const graphEngine = new GraphEngine();

export const useStore = create((set, get) => ({
  systemStatus: 'ONLINE',
  currentFloor: 'Floor 1',
  isSimulationMode: true,
  autoRoutingEnabled: true,
  emergencyMode: false,
  
  nodes: initialNodes,
  edges: initialEdges,
  rooms: initialRooms,
  selectedNodeId: null,
  evacuees: [],
  hazards: [],
  simulationRunning: false,
  
  logs: [],
  commandQueue: [],
  currentRoute: null,
  
  initEngine: () => {
    graphEngine.loadGraph(get().nodes, get().edges);
    get().recalculateRoutes();
  },

  startSimulation: () => {
    get().logEvent("SIMULATION INITIATED: Spawning evacuees in rooms.");
    
    const newEvacuees = [];
    const rooms = get().rooms;
    
    // Spawn evacuees inside rooms
    for (let i = 0; i < 60; i++) {
      const room = rooms[Math.floor(Math.random() * rooms.length)];
      if (room && room.id !== 'CORE') {
        const startX = room.x + (Math.random() * room.w * 0.8) + (room.w * 0.1);
        const startY = room.y + (Math.random() * room.h * 0.8) + (room.h * 0.1);
        
        // Find nearest corridor node to the room center
        let nearestNode = null;
        let minDist = Infinity;
        const cx = room.x + room.w/2;
        const cy = room.y + room.h/2;
        
        get().nodes.forEach(n => {
           if (n.type === 'exit') return;
           const dist = Math.sqrt(Math.pow(n.x - cx, 2) + Math.pow(n.y - cy, 2));
           if (dist < minDist) {
             minDist = dist;
             nearestNode = n;
           }
        });

        newEvacuees.push({
          id: `evac_${i}`,
          x: startX,
          y: startY,
          currentNodeId: null,
          targetNodeId: nearestNode ? nearestNode.id : null,
          speed: 1.5 + Math.random() * 1.5,
          color: `hsl(${Math.random() * 30 + 10}, 90%, 60%)`
        });
      }
    }

    set({ evacuees: newEvacuees, hazards: [], simulationRunning: true });
    get().recalculateRoutes();
  },

  updateEvacuees: (updatedEvacuees) => set({ evacuees: updatedEvacuees }),

  incrementThroughput: (nodeId) => {
    set(state => {
      const newNodes = state.nodes.map(n => 
        n.id === nodeId ? { ...n, throughput: n.throughput + 1 } : n
      );
      return { nodes: newNodes };
    });
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  toggleExit: (id) => {
    set(state => {
      const newNodes = state.nodes.map(n => 
        n.id === id ? { ...n, blocked: !n.blocked } : n
      );
      get().logEvent(`Exit ${id} ${newNodes.find(n=>n.id===id).blocked ? 'closed' : 'opened'} by operator.`);
      return { nodes: newNodes };
    });
    get().recalculateRoutes();
  },

  addHazard: (x, y, hazardType) => {
    set(state => {
      const newHazard = { id: Date.now(), x, y, type: hazardType, radius: 80 };
      get().logEvent(`Hazard (${hazardType}) detected at coords [${Math.round(x)}, ${Math.round(y)}].`);
      return { hazards: [...state.hazards, newHazard] };
    });
    get().recalculateRoutes();
  },

  clearHazards: () => {
    set({ hazards: [] });
    get().logEvent(`All hazards cleared.`);
    get().recalculateRoutes();
  },

  recalculateRoutes: () => {
    if (!get().autoRoutingEnabled) return;
    
    graphEngine.loadGraph(get().nodes, get().edges, get().hazards);
    const exits = get().nodes.filter(n => n.type === 'exit' && !n.blocked).map(n => n.id);
    
    let changesMade = false;
    let newRouteHighlights = [];

    const updatedNodes = get().nodes.map(node => {
      if (node.type === 'exit') return node;

      const route = graphEngine.findSafestRoute(node.id, exits);
      if (route && route.path.length > 1) {
        const nextHop = route.path[1];
        
        // determine direction visually based on coordinates
        const nextNode = get().nodes.find(n => n.id === nextHop);
        let dir = 'forward';
        if (nextNode.x > node.x) dir = 'right';
        if (nextNode.x < node.x) dir = 'left';
        if (nextNode.y < node.y) dir = 'forward'; // Assuming Y goes down, so smaller Y is "up/forward" on map
        if (nextNode.y > node.y) dir = 'backward'; // "down" on map

        if (node.id === get().selectedNodeId) {
            newRouteHighlights = route.path;
        }

        if (node.next_hop !== nextHop || node.display_direction !== dir) {
          changesMade = true;
          // Queue a command
          get().queueCommand(node.id, { direction: dir, audio: 'Proceed to exit', target: nextHop });
        }

        return {
          ...node,
          next_hop: nextHop,
          display_direction: dir,
          route_cost: route.cost,
          last_update: Date.now()
        };
      } else {
        if (node.display_direction !== 'stop') {
          changesMade = true;
          get().queueCommand(node.id, { direction: 'stop', audio: 'Stop and wait', target: null });
        }
        return {
          ...node,
          next_hop: null,
          display_direction: 'stop',
          route_cost: Infinity,
          last_update: Date.now()
        };
      }
    });

    if (changesMade) {
      get().logEvent('Routes re-calculated due to graph changes.');
    }

    set({ nodes: updatedNodes, currentRoute: newRouteHighlights.length > 0 ? newRouteHighlights : get().currentRoute });
  },

  queueCommand: (nodeId, payload) => {
    set(state => {
      const newCmd = { id: Date.now() + Math.random(), nodeId, payload, status: 'pending', time: new Date().toLocaleTimeString() };
      return { commandQueue: [newCmd, ...state.commandQueue].slice(0, 50) }; // keep last 50
    });
  },

  logEvent: (msg) => {
    set(state => {
      const newLog = { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), msg };
      return { logs: [newLog, ...state.logs].slice(0, 100) };
    });
  },

  toggleAutoRouting: () => set(state => {
    const newState = !state.autoRoutingEnabled;
    get().logEvent(`Auto-routing ${newState ? 'enabled' : 'disabled'}.`);
    return { autoRoutingEnabled: newState };
  }),

  setEmergencyMode: (val) => set({ emergencyMode: val })
}));
