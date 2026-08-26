// A* Routing Logic
export class GraphEngine {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.hazards = [];
  }

  loadGraph(nodeList, edgeList, hazardList = []) {
    this.nodes.clear();
    this.edges.clear();
    this.hazards = hazardList;
    
    nodeList.forEach(n => {
      this.nodes.set(n.id, n);
      this.edges.set(n.id, []);
    });

    edgeList.forEach(e => {
      if (this.nodes.has(e.source) && this.nodes.has(e.target)) {
        this.edges.get(e.source).push({ target: e.target, baseWeight: e.weight || 1 });
        this.edges.get(e.target).push({ target: e.source, baseWeight: e.weight || 1 }); 
      }
    });
  }

  getWeight(fromId, toId) {
    const toNode = this.nodes.get(toId);
    let penalty = 0;
    
    if (toNode.blocked) return Infinity;
    if (!toNode.active) return Infinity;
    
    // Check distance to all coordinate-based hazards
    this.hazards.forEach(hazard => {
      const dist = Math.sqrt(Math.pow(toNode.x - hazard.x, 2) + Math.pow(toNode.y - hazard.y, 2));
      if (dist <= hazard.radius) {
        if (hazard.type === 'fire') penalty += 2000;
        if (hazard.type === 'smoke') penalty += 1000;
        if (hazard.type === 'gas') penalty += 1500;
      } else if (dist <= hazard.radius * 2.5) {
        // Proximity penalty - discourages routing near hazards
        penalty += 300;
      }
    });
    
    if (toNode.congestion_level > 0.8) penalty += 50;
    else if (toNode.congestion_level > 0.5) penalty += 20;

    const edge = this.edges.get(fromId).find(e => e.target === toId);
    const base = edge ? edge.baseWeight : 1;

    return base + penalty;
  }

  findSafestRoute(startId, exitIds) {
    const openSet = new Set([startId]);
    const cameFrom = new Map();
    
    const gScore = new Map();
    this.nodes.forEach((_, id) => gScore.set(id, Infinity));
    gScore.set(startId, 0);

    const fScore = new Map();
    this.nodes.forEach((_, id) => fScore.set(id, Infinity));
    
    fScore.set(startId, 0);

    while (openSet.size > 0) {
      let current = null;
      let minF = Infinity;
      openSet.forEach(id => {
        if (fScore.get(id) < minF) {
          minF = fScore.get(id);
          current = id;
        }
      });

      if (!current) break;

      if (exitIds.includes(current)) {
        return this.reconstructPath(cameFrom, current, gScore.get(current));
      }

      openSet.delete(current);

      const neighbors = this.edges.get(current) || [];
      for (const neighbor of neighbors) {
        const neighborId = neighbor.target;
        const weight = this.getWeight(current, neighborId);
        
        if (weight >= Infinity) continue;

        const tentative_gScore = gScore.get(current) + weight;

        if (tentative_gScore < gScore.get(neighborId)) {
          cameFrom.set(neighborId, current);
          gScore.set(neighborId, tentative_gScore);
          fScore.set(neighborId, tentative_gScore);
          if (!openSet.has(neighborId)) {
            openSet.add(neighborId);
          }
        }
      }
    }

    return null; 
  }

  reconstructPath(cameFrom, current, totalCost) {
    const path = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      path.unshift(current);
    }
    return { path, cost: totalCost };
  }
}
