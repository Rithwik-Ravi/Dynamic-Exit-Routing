/**
 * graph_view.js - 2D Node Graph (Top View) for Live Monitoring
 * Displays color-coded nodes from /state and corridor links from saved matrix.
 * Ensures node cards with ID are present at every link endpoint and connection.
 */

const Graph2DView = {
  canvas: null,
  ctx: null,
  container: null,

  nodes: [],               // Live node data from /state
  edges: [],               // Corridor edges from saved matrix
  exits: [],               // Exit node IDs (node_type === 'exit')
  junctions: [],           // Junction node IDs (node_type === 'junction')
  mainEntranceId: null,    // Main entrance ID
  nodePositions: new Map(), // node_id -> { x, y }

  currentMode: 'live',

  // Canvas size
  width: 0,
  height: 0,

  // Pan & Zoom
  scale: 1.0,
  offsetX: 0,
  offsetY: 0,
  isDragging: false,
  dragStart: { x: 0, y: 0 },

  init(canvasId, containerId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    if (!this.canvas || !this.container) return;

    this.ctx = this.canvas.getContext('2d');
    this.resize();

    window.addEventListener('resize', this.resize.bind(this));
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.canvas.addEventListener('click', this.onClick.bind(this));

    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
  },

  resize() {
    if (!this.container || !this.canvas) return;
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.width = rect.width;
    this.height = rect.height;

    if (this.offsetX === 0 && this.offsetY === 0) {
      this.offsetX = this.width / 2;
      this.offsetY = this.height / 2;
    }
  },

  getNodeData(nid) {
    if (!nid) return {};
    const norm = (id) => String(id || '').trim().toUpperCase();
    const target = norm(nid);

    // 1. Search this.nodes from /state
    let match = (this.nodes || []).find(n => {
      const a = norm(n.node_id || n.id);
      return a === target || a === `NODE-${target}` || `NODE-${a}` === target;
    });

    // 2. Search window.allNodes
    if (!match) {
      match = (window.allNodes || []).find(n => {
        const a = norm(n.node_id || n.id);
        return a === target || a === `NODE-${target}` || `NODE-${a}` === target;
      });
    }

    // 3. Search routing routes_by_node (crucial for Junction nodes)
    let routeInfo = null;
    if (this.routing && this.routing.routes_by_node) {
      for (const [key, val] of Object.entries(this.routing.routes_by_node)) {
        if (norm(key) === target) {
          routeInfo = val;
          break;
        }
      }
    }

    if (match || routeInfo) {
      return Object.assign({}, match || {}, routeInfo || {});
    }

    return {};
  },

  getNodePos(nid) {
    if (!nid) return null;
    const norm = (id) => String(id || '').trim().toUpperCase();
    const target = norm(nid);

    for (const [key, pos] of this.nodePositions.entries()) {
      if (norm(key) === target && pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        return pos;
      }
    }

    const n = this.getNodeData(nid);
    if (n && n.position_2d && typeof n.position_2d.x === 'number' && typeof n.position_2d.y === 'number') {
      const p = { x: n.position_2d.x, y: n.position_2d.y };
      this.nodePositions.set(nid, p);
      return p;
    }
    return null;
  },

  getAllGraphNodeIds() {
    const ids = new Set();
    // 1. All link endpoints (from and to)
    (this.edges || []).forEach(e => {
      if (e.from) ids.add(e.from);
      if (e.to) ids.add(e.to);
    });
    // 2. All nodes from telemetry state
    (this.nodes || []).forEach(n => {
      const nid = n.node_id || n.id;
      if (nid) ids.add(nid);
    });
    // 3. All exits & junctions
    (this.exits || []).forEach(id => { if (id) ids.add(id); });
    (this.junctions || []).forEach(id => { if (id) ids.add(id); });
    // 4. All keys in nodePositions
    if (this.nodePositions) {
      for (const nid of this.nodePositions.keys()) {
        if (nid) ids.add(nid);
      }
    }
    return Array.from(ids);
  },

  clearGraph() {
    this.nodes = [];
    this.edges = [];
    this.exits = [];
    this.junctions = [];
    this.nodePositions.clear();
    this.routing = {};
    if (this.ctx && this.canvas) {
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }
  },

  isExitId(nid) {
    if (!nid) return false;
    const s = String(nid).trim().toUpperCase();
    return s.startsWith('EXIT') || (this.exits || []).some(e => String(e).trim().toUpperCase() === s);
  },

  isJunctionId(nid) {
    if (!nid) return false;
    const s = String(nid).trim().toUpperCase();
    return s.startsWith('JUNC') || (this.junctions || []).some(j => String(j).trim().toUpperCase() === s);
  },

  // Called by app.js whenever /state data arrives
  updateData(nodes, mode, routing) {
    this.nodes = nodes || [];
    if (mode) this.currentMode = mode;
    if (routing) this.routing = routing;

    // In live mode, if no live nodes are present, clean up orphaned test positions
    if (this.currentMode === 'live' && this.nodes.length === 0) {
      const allowedIds = new Set([
        ...this.nodes.map(n => n.node_id || n.id),
        ...(this.exits || []),
        ...(this.junctions || [])
      ]);
      for (const nid of Array.from(this.nodePositions.keys())) {
        if (!allowedIds.has(nid)) {
          this.nodePositions.delete(nid);
        }
      }
    }

    // Update positions from node data
    this.nodes.forEach(node => {
      const nid = node.node_id || node.id;
      const pos = node.position_2d;
      if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
        this.nodePositions.set(nid, { x: pos.x, y: pos.y });
      }
    });

    // Toggle empty state message only for live mode when no nodes exist
    const emptyEl = document.getElementById('empty-state');
    if (emptyEl) {
      const allIds = this.getAllGraphNodeIds();
      const shouldShow = (allIds.length === 0 && this.currentMode === 'live');
      emptyEl.style.display = shouldShow ? 'flex' : 'none';
    }
  },

  // Called by app.js after fetching the matrix for this mode
  updateEdgesFromMatrix(edgesData, exitsData, mainEntranceId, junctionsData) {
    this.edges = edgesData || [];
    this.exits = exitsData || [];
    this.junctions = junctionsData || [];
    if (mainEntranceId !== undefined) this.mainEntranceId = mainEntranceId;
  },

  renderLoop() {
    this.draw();
    requestAnimationFrame(this.renderLoop);
  },

  draw() {
    if (!this.ctx || !this.canvas || this.width === 0 || this.height === 0) {
      this.resize();
      if (!this.ctx || this.width === 0 || this.height === 0) return;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();

    const isLiveEmpty = (this.currentMode === 'live' && (this.nodes || []).length === 0 && (this.edges || []).length === 0);

    const emptyEl = document.getElementById('empty-state');
    if (emptyEl) {
      emptyEl.style.display = (isLiveEmpty && this.currentMode === 'live') ? 'flex' : 'none';
    }

    if (isLiveEmpty) {
      return;
    }

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // 1. Draw corridor edges from matrix (purely color-coded links)
    this.drawMatrixEdges(ctx);

    // 2. Draw all nodes (ensuring node card is present at every link endpoint)
    this.drawAllNodes(ctx);

    ctx.restore();
  },

  drawMatrixEdges(ctx) {
    if (!this.edges || this.edges.length === 0) return;
    const nowSec = performance.now() / 1000;

    // 1. Draw static corridor lines (clean crisp lines)
    this.edges.forEach(edge => {
      const p1 = this.getNodePos(edge.from);
      const p2 = this.getNodePos(edge.to);
      if (!p1 || !p2) return;

      const dist = (edge.distance !== undefined && edge.distance !== null) ? edge.distance : edge.base_distance;
      const isBlocked = (dist === -1.0 || dist < 0);
      const isCongested = (edge.reason && edge.reason.includes('CONGESTION'));
      const isWarning = (edge.reason && edge.reason.includes('WARNING'));

      let strokeColor = '#3b82f6';
      let lineWidth = 2.5;

      if (isBlocked) {
        strokeColor = '#ef4444';
        lineWidth = 2.5;
      } else if (isWarning) {
        strokeColor = '#f59e0b';
        lineWidth = 2.5;
      } else if (isCongested) {
        strokeColor = '#f59e0b';
        lineWidth = 2.5;
      }

      ctx.save();
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      if (isBlocked) {
        ctx.setLineDash([6, 5]);
      }
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    });

    // 2. Draw dynamic moving circles indicating movement direction along links
    this.edges.forEach(edge => {
      const p1 = this.getNodePos(edge.from);
      const p2 = this.getNodePos(edge.to);
      if (!p1 || !p2) return;

      const dist = (edge.distance !== undefined && edge.distance !== null) ? edge.distance : edge.base_distance;
      const isBlocked = (dist === -1.0 || dist < 0);
      this.drawEdgeMovementCircles(ctx, edge, p1, p2, isBlocked, nowSec);
    });
  },

  getLinkEvacuationDirection(edge, p1, p2) {
    const norm = (s) => String(s || '').trim().toUpperCase();
    const u = norm(edge.from);
    const v = norm(edge.to);

    const node1 = this.getNodeData(edge.from);
    const node2 = this.getNodeData(edge.to);

    const nextHop1 = norm(node1.next_hop);
    const nextHop2 = norm(node2.next_hop);

    // 1. Direct next_hop check on either endpoint
    if (nextHop1 && nextHop1 === v) {
      return { fromPos: p1, toPos: p2, fromId: edge.from, toId: edge.to };
    }
    if (nextHop2 && nextHop2 === u) {
      return { fromPos: p2, toPos: p1, fromId: edge.to, toId: edge.from };
    }

    // 2. Complete evacuation route paths check from all nodes and routing dictionary
    const allPaths = [];
    (this.nodes || []).forEach(n => {
      if (Array.isArray(n.nearest_exit_path) && n.nearest_exit_path.length > 1) {
        allPaths.push(n.nearest_exit_path.map(norm));
      }
    });
    if (this.routing && this.routing.routes_by_node) {
      Object.values(this.routing.routes_by_node).forEach(r => {
        if (Array.isArray(r.nearest_exit_path) && r.nearest_exit_path.length > 1) {
          allPaths.push(r.nearest_exit_path.map(norm));
        }
      });
    }

    for (const path of allPaths) {
      for (let i = 0; i < path.length - 1; i++) {
        if (path[i] === u && path[i + 1] === v) {
          return { fromPos: p1, toPos: p2, fromId: edge.from, toId: edge.to };
        }
        if (path[i] === v && path[i + 1] === u) {
          return { fromPos: p2, toPos: p1, fromId: edge.to, toId: edge.from };
        }
      }
    }

    // 3. Fallback towards exits ONLY for direct links connecting directly to an exit door
    if (this.isExitId(edge.to) && !this.isExitId(edge.from) && !this.isJunctionId(edge.from)) {
      return { fromPos: p1, toPos: p2, fromId: edge.from, toId: edge.to };
    }
    if (this.isExitId(edge.from) && !this.isExitId(edge.to) && !this.isJunctionId(edge.to)) {
      return { fromPos: p2, toPos: p1, fromId: edge.to, toId: edge.from };
    }

    return null;
  },

  drawEdgeMovementCircles(ctx, edge, p1, p2, isBlocked, nowSec) {
    if (isBlocked) return;

    const dir = this.getLinkEvacuationDirection(edge, p1, p2);
    if (!dir || !dir.fromPos || !dir.toPos) return;

    const fromPos = dir.fromPos;
    const toPos = dir.toPos;

    let moveColor = '#10b981';
    let speed = 0.45;

    if (edge.reason && edge.reason.includes('WARNING')) {
      moveColor = '#f59e0b';
      speed = 0.35;
    } else if (edge.reason && edge.reason.includes('CONGESTION')) {
      moveColor = '#f59e0b';
      speed = 0.25;
    }

    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const length = Math.hypot(dx, dy);
    if (length < 15) return;

    const count = Math.max(2, Math.min(6, Math.floor(length / 50)));

    ctx.save();
    for (let i = 0; i < count; i++) {
      const phase = i / count;
      const t = (nowSec * speed + phase) % 1.0;

      const margin = 24 / length;
      if (t < margin || t > (1.0 - margin)) continue;

      const px = fromPos.x + dx * t;
      const py = fromPos.y + dy * t;

      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = moveColor;
      ctx.fill();
    }
    ctx.restore();
  },

  drawAllNodes(ctx) {
    const allIds = this.getAllGraphNodeIds();

    allIds.forEach(nid => {
      const p = this.getNodePos(nid);
      if (!p) return;

      const nodeData = this.getNodeData(nid);
      const isSelected = window.selectedNodeData && (
        String(window.selectedNodeData.node_id).toUpperCase() === String(nid).toUpperCase() ||
        String(window.selectedNodeData.id).toUpperCase() === String(nid).toUpperCase()
      );

      const isExit = (this.exits || []).some(e => String(e).toUpperCase() === String(nid).toUpperCase()) ||
                     String(nid).toUpperCase().startsWith('EXIT') ||
                     nodeData.node_type === 'exit';

      const isJunction = (this.junctions || []).some(j => String(j).toUpperCase() === String(nid).toUpperCase()) ||
                         String(nid).toUpperCase().startsWith('JUNC') ||
                         nodeData.node_type === 'junction';

      if (isExit) {
        this.drawExitCard(ctx, nid, p, isSelected, nodeData);
      } else if (isJunction) {
        this.drawJunctionCard(ctx, nid, p, isSelected, nodeData);
      } else {
        this.drawSensorNodeCard(ctx, nid, p, isSelected, nodeData);
      }
    });
  },

  drawSensorNodeCard(ctx, nid, p, isSelected, node) {
    const isBlocked = (node.blocked === true);
    const isCritical = (node.hazard_flag === 'CRITICAL' || node.hazard_flag === 'FIRE');
    const isWarning = (node.hazard_flag === 'WARNING');
    const isCongested = (node.congestion_level === 'HIGH' || (node.area_ratio && node.area_ratio > 0.4));

    let strokeColor = '#282e3f';
    let textColor = '#f8fafc';

    if (isBlocked || isCritical) {
      strokeColor = '#ef4444';
      textColor = '#ef4444';
    } else if (isWarning) {
      strokeColor = '#f59e0b';
      textColor = '#f59e0b';
    } else if (isCongested) {
      strokeColor = '#f59e0b';
      textColor = '#f59e0b';
    } else if (isSelected) {
      strokeColor = '#3b82f6';
    }

    ctx.save();

    // Node Card Box
    const w = 94;
    const h = 42;
    ctx.fillStyle = '#151822';
    ctx.strokeStyle = isSelected ? '#3b82f6' : strokeColor;
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, 6);
    ctx.fill();
    ctx.stroke();

    // Node ID Label
    ctx.fillStyle = textColor;
    ctx.font = "600 12px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(nid), p.x, p.y);

    // Status Badge above card
    if (isCritical || isBlocked) {
      this.drawFloatingBadge(ctx, p.x, p.y - 29, isBlocked ? 'BLOCKED' : 'CRITICAL', '#ef4444');
    } else if (isWarning) {
      this.drawFloatingBadge(ctx, p.x, p.y - 29, 'WARN', '#f59e0b');
    } else if (node.people_count && node.people_count > 0) {
      this.drawFloatingBadge(ctx, p.x, p.y - 29, `${node.people_count} ppl`, '#0ea5e9');
    }

    ctx.restore();
  },

  drawExitCard(ctx, nid, p, isSelected, node) {
    const w = 108;
    const h = 50;
    const isMainEntrance = (this.mainEntranceId === nid);

    ctx.save();

    // Card Box
    ctx.fillStyle = '#0f1f1a';
    ctx.strokeStyle = isSelected ? '#f8fafc' : '#10b981';
    ctx.lineWidth = isSelected ? 2 : (isMainEntrance ? 1.5 : 1);
    ctx.beginPath();
    ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, 6);
    ctx.fill();
    ctx.stroke();

    // Exit label
    ctx.fillStyle = '#10b981';
    ctx.font = "700 12px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`EXIT ${nid}`, p.x, p.y - 8);

    ctx.fillStyle = '#34d399';
    ctx.font = "600 9px 'JetBrains Mono', monospace";
    ctx.fillText(isMainEntrance ? 'MAIN ENTRANCE' : 'EXIT NODE', p.x, p.y + 11);

    if (isMainEntrance) {
      this.drawFloatingBadge(ctx, p.x, p.y - 34, 'MAIN ENTRANCE', '#10b981');
    }

    ctx.restore();
  },

  drawJunctionCard(ctx, nid, p, isSelected, node) {
    ctx.save();

    // Junction Circle
    ctx.fillStyle = '#111726';
    ctx.strokeStyle = isSelected ? '#f8fafc' : '#3b82f6';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Junction Symbol
    ctx.fillStyle = '#3b82f6';
    ctx.font = "600 13px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText('+', p.x, p.y);

    // Junction ID below
    ctx.fillStyle = '#94a3b8';
    ctx.font = "600 10px 'JetBrains Mono', monospace";
    ctx.fillText(String(nid), p.x, p.y + 26);

    ctx.restore();
  },

  drawNodeDualSignPill(ctx, x, y, node) {
    const dispA = (node && node.display_a) ? String(node.display_a).trim().toUpperCase() : 'STOP';
    const dispB = (node && node.display_b) ? String(node.display_b).trim().toUpperCase() : 'FORWARD';

    const isStopA = (dispA === 'STOP' || dispA === 'BLOCKED' || dispA === 'X');
    const isStopB = (dispB === 'STOP' || dispB === 'BLOCKED' || dispB === 'X');

    const textA = isStopA ? 'STOP' : 'GO';
    const textB = isStopB ? 'STOP' : 'GO';

    ctx.save();
    // Pill housing background
    ctx.fillStyle = '#0f121a';
    ctx.strokeStyle = '#232738';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 48, y - 7, 96, 18, 4);
    ctx.fill();
    ctx.stroke();

    // Display A
    ctx.fillStyle = isStopA ? '#ef4444' : '#10b981';
    ctx.font = "600 9px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`A:${textA}`, x - 24, y + 2);

    // Divider
    ctx.fillStyle = '#232738';
    ctx.fillRect(x - 0.5, y - 5, 1, 14);

    // Display B
    ctx.fillStyle = isStopB ? '#ef4444' : '#10b981';
    ctx.fillText(`B:${textB}`, x + 24, y + 2);
    ctx.restore();
  },

  drawFloatingBadge(ctx, x, y, text, color) {
    ctx.save();
    ctx.fillStyle = '#11141d';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - 36, y - 8, 72, 16, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = "600 9px 'Inter', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  },

  // Mouse Interaction
  onMouseDown(e) {
    if (e.button === 0) {
      this.isDragging = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
    }
  },

  onMouseMove(e) {
    if (this.isDragging) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.offsetX += dx;
      this.offsetY += dy;
      this.dragStart = { x: e.clientX, y: e.clientY };
    }
  },

  onMouseUp() {
    this.isDragging = false;
  },

  onWheel(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    this.scale = Math.max(0.4, Math.min(2.5, this.scale * zoomFactor));
  },

  onClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left - this.offsetX) / this.scale;
    const clickY = (e.clientY - rect.top - this.offsetY) / this.scale;

    const allIds = this.getAllGraphNodeIds();
    for (const nid of allIds) {
      const p = this.getNodePos(nid);
      if (!p) continue;
      if (Math.abs(clickX - p.x) <= 58 && Math.abs(clickY - p.y) <= 30) {
        window.selectNodeById(nid);
        break;
      }
    }
  },

  resetView() {
    this.scale = 1.0;
    this.offsetX = this.width / 2;
    this.offsetY = this.height / 2;
  }
};

window.Graph2DView = Graph2DView;
