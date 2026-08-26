/**
 * editor_view.js - Context-Driven Layout & Graph Connection Editor
 * Features:
 * - Purely software Junction Nodes (not connected to physical hardware sensors).
 * - Adjacency Matrix includes Sensors, Exits, and Junction Nodes.
 * - Rubberband connection line follows mouse after clicking a node until target click or cancel.
 * - Right-click context menu with Add Sensor, Add Exit, Add Junction, Connect, and Delete.
 * - Main Entrance designation tick badge & toggle.
 * - Double-click node to edit Node ID.
 * - Click & drag on empty space pans canvas, scroll wheel zooms.
 * - Hovering links focuses them with brighter color & thicker stroke + right-click delete.
 * - Auto-save to memory & disk on page change & 5-min timer.
 */

const LayoutEditor = {
  canvas: null,
  ctx: null,
  container: null,

  currentMode: 'live', // 'live' or 'test'
  nodes: [],          // Configured SENSOR nodes on canvas
  exitNodes: [],      // Configured EXIT nodes on canvas
  junctionNodes: [],  // Configured SOFTWARE JUNCTION nodes on canvas
  mainEntranceId: null, // Single designated main entrance ID
  edges: [],          // [ { from, to, base_distance, distance } ]
  positions: new Map(), // node_id -> { x, y }

  unconfiguredNodes: [], // [ { node_id, location, ... } ]

  // Selection, Hover & Connection State
  connectSourceNode: null,
  hoveredNode: null,
  hoveredEdge: null,
  draggedNode: null,
  mouseDownNode: null,
  mouseDownPos: { x: 0, y: 0 },
  mouseCanvasPos: { x: 0, y: 0 },

  // Context Menu State
  ctxTargetPos: null,
  ctxTargetNode: null,
  ctxTargetEdge: null,

  // Pan & Zoom
  scale: 1.0,
  offsetX: 0,
  offsetY: 0,
  isPanning: false,
  panStart: { x: 0, y: 0 },

  // Auto-Save Timers
  autoSaveTimer: null,
  diskTimer: null,

  init(canvasId, containerId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    if (!this.canvas || !this.container) return;

    this.ctx = this.canvas.getContext('2d');
    this.resize();

    // Event Listeners
    window.addEventListener('resize', this.resize.bind(this));
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('dblclick', this.onDblClick.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.canvas.addEventListener('contextmenu', this.onContextMenu.bind(this));

    // Hide context menu when clicking outside
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('editor-context-menu');
      if (menu && !menu.contains(e.target)) {
        this.hideContextMenu();
      }
    });

    // Page Unload Auto-Save
    window.addEventListener('beforeunload', () => {
      this.saveGraphToDisk();
    });

    // 5-Minute Recurring Disk Save Timer
    if (this.diskTimer) clearInterval(this.diskTimer);
    this.diskTimer = setInterval(() => {
      this.saveGraphToDisk();
    }, 5 * 60 * 1000);

    this.renderLoop = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoop);
  },

  resize() {
    if (!this.container || !this.canvas) return;
    const rect = this.container.getBoundingClientRect();
    this.canvas.width = rect.width * window.devicePixelRatio;
    this.canvas.height = rect.height * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    this.width = rect.width;
    this.height = rect.height;

    if (this.offsetX === 0 && this.offsetY === 0) {
      this.offsetX = this.width / 2;
      this.offsetY = this.height / 2;
    }
  },

  get allCanvasNodeIds() {
    return [...this.nodes, ...this.exitNodes, ...this.junctionNodes];
  },

  // -------------------------------------------------------------
  // SOURCE SYNC & MATRIX CHECK (Live vs Test)
  // -------------------------------------------------------------
  async loadGraphFromDisk(mode) {
    this.currentMode = mode || window.currentMode || 'live';

    const modeBadge = document.getElementById('editor-mode-badge');
    if (modeBadge) {
      modeBadge.textContent = (this.currentMode === 'test') ? 'TEST DICT (test_nodes)' : 'LIVE HARDWARE (nodes)';
      modeBadge.className = `editor-mode-pill ${this.currentMode === 'test' ? 'test' : 'live'}`;
    }

    try {
      const res = await fetch(`/api/graph/load?mode=${this.currentMode}`);
      const data = await res.json();

      const allNodes = data.nodes || [];
      this.nodes = allNodes.filter(n => (n.node_type || 'sensor') === 'sensor').map(n => n.id || n.node_id || n);
      this.exitNodes = allNodes.filter(n => n.node_type === 'exit').map(n => n.id || n.node_id || n);
      this.junctionNodes = allNodes.filter(n => n.node_type === 'junction').map(n => n.id || n.node_id || n);

      this.mainEntranceId = data.main_entrance_id || data.main_exit_id || null;

      this.edges = data.edges || [];
      this.positions.clear();

      if (data.node_positions) {
        for (const [nid, pos] of Object.entries(data.node_positions)) {
          this.positions.set(nid, pos);
        }
      }

      this.unconfiguredNodes = data.unconfigured_nodes || [];

      this.ensurePositions();
      this.renderMatrixTable();
      this.renderUnconfiguredList();

      const totalOnCanvas = this.allCanvasNodeIds.length;
      if (data.exists && totalOnCanvas > 0) {
        this.showToast(`Loaded layout (${this.nodes.length} sensors, ${this.exitNodes.length} exits, ${this.junctionNodes.length} junctions)`, "info");
      } else {
        this.showToast(`Canvas is empty for ${this.currentMode.toUpperCase()} (${this.unconfiguredNodes.length} unconfigured nodes available)`, "info");
      }
    } catch (err) {
      console.error(err);
      this.nodes = [];
      this.exitNodes = [];
      this.junctionNodes = [];
      this.mainEntranceId = null;
      this.edges = [];
      this.positions.clear();
      this.unconfiguredNodes = [];
      this.renderMatrixTable();
      this.renderUnconfiguredList();
    }
  },

  ensurePositions() {
    const total = this.allCanvasNodeIds.length;
    this.allCanvasNodeIds.forEach((nid, i) => {
      if (!this.positions.has(nid)) {
        const radius = Math.min(300, Math.max(160, total * 35));
        const angle = (i / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
        this.positions.set(nid, {
          x: Math.round(Math.cos(angle) * radius),
          y: Math.round(Math.sin(angle) * radius)
        });
      }
    });
  },

  // -------------------------------------------------------------
  // UNCONFIGURED NODES TRAY
  // -------------------------------------------------------------
  renderUnconfiguredList() {
    const container = document.getElementById('unconfigured-nodes-list');
    const badge = document.getElementById('unconf-count-badge');
    const btnPlaceAll = document.getElementById('btn-place-all');
    if (!container) return;

    const count = this.unconfiguredNodes.length;
    if (badge) badge.textContent = count;
    if (btnPlaceAll) btnPlaceAll.style.display = (count > 0) ? 'flex' : 'none';

    if (count === 0) {
      container.innerHTML = '<div class="unconf-empty-msg"><i class="fa-solid fa-circle-check"></i> All dictionary nodes are placed on canvas.</div>';
      return;
    }

    let html = '';
    this.unconfiguredNodes.forEach(node => {
      html += `
        <div class="unconf-item">
          <div class="unconf-node-info">
            <span class="unconf-node-id">${node.node_id}</span>
            <span class="unconf-node-loc">${node.location || 'Corridor Node'}</span>
          </div>
          <button class="btn-place-node" onclick="LayoutEditor.placeUnconfiguredNode('${node.node_id}')">
            <i class="fa-solid fa-arrow-left"></i> Place on Canvas
          </button>
        </div>
      `;
    });

    container.innerHTML = html;
  },

  placeUnconfiguredNode(nodeId) {
    const nodeObj = this.unconfiguredNodes.find(n => n.node_id === nodeId);
    if (!nodeObj) return;

    this.unconfiguredNodes = this.unconfiguredNodes.filter(n => n.node_id !== nodeId);

    const count = this.allCanvasNodeIds.length + 1;
    const radius = Math.min(280, Math.max(120, count * 35));
    const angle = ((count - 1) / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(Math.cos(angle) * radius);
    const y = Math.round(Math.sin(angle) * radius);

    this.nodes.push(nodeId);
    this.positions.set(nodeId, { x, y });

    this.triggerMemoryChange();
    this.showToast(`Placed ${nodeId} onto canvas`, "success");
  },

  placeAllUnconfigured() {
    if (this.unconfiguredNodes.length === 0) return;

    const alreadyPlaced = new Set(this.allCanvasNodeIds);
    const newIds = this.unconfiguredNodes.map(n => n.node_id);

    newIds.forEach(nid => this.nodes.push(nid));
    this.unconfiguredNodes = [];

    const totalAfter = this.allCanvasNodeIds.length;
    const radius = Math.min(320, Math.max(150, totalAfter * 35));

    newIds.forEach((nid, i) => {
      if (!alreadyPlaced.has(nid)) {
        const startAngle = (alreadyPlaced.size / Math.max(1, totalAfter)) * Math.PI * 2;
        const angle = startAngle + (i / Math.max(1, newIds.length)) * Math.PI * 2 - Math.PI / 2;
        this.positions.set(nid, {
          x: Math.round(Math.cos(angle) * radius),
          y: Math.round(Math.sin(angle) * radius)
        });
      }
    });

    this.triggerMemoryChange();
    this.showToast(`Placed all ${newIds.length} unconfigured nodes on canvas`, "success");
  },

  // -------------------------------------------------------------
  // AUTO-SAVE (In-Memory + Disk Sync)
  // -------------------------------------------------------------
  triggerMemoryChange() {
    this.renderMatrixTable();
    this.renderUnconfiguredList();

    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.saveGraphToDisk();
    }, 2000);
  },

  async saveGraphToDisk() {
    const nodeObjList = [
      ...this.nodes.map(nid => ({
        node_id: nid,
        node_type: 'sensor',
        position_2d: this.positions.get(nid) || { x: 0, y: 0 }
      })),
      ...this.exitNodes.map(nid => ({
        node_id: nid,
        node_type: 'exit',
        position_2d: this.positions.get(nid) || { x: 0, y: 0 }
      })),
      ...this.junctionNodes.map(nid => ({
        node_id: nid,
        node_type: 'junction',
        position_2d: this.positions.get(nid) || { x: 0, y: 0 }
      }))
    ];

    const payload = {
      mode: this.currentMode,
      nodes: nodeObjList,
      edges: this.edges,
      main_entrance_id: this.mainEntranceId
    };

    try {
      const response = await fetch('/api/graph/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const res = await response.json();

      if (response.ok) {
        const dictName = (this.currentMode === 'test') ? 'test_nodes' : 'nodes';
        this.showToast(`Auto-saved layout (${res.node_count}×${res.node_count}) to disk & '${dictName}'`, "success");
        if (window.logIncident) {
          window.logIncident(`[EDITOR] Layout auto-saved to disk (${this.currentMode.toUpperCase()})`, "info");
        }
        this.renderMatrixTable();
        this.renderUnconfiguredList();

        if (window.loadMatrixEdgesForMonitor) {
          window.loadMatrixEdgesForMonitor(this.currentMode);
        }
      }
    } catch (err) {
      // Silent auto-save fallback
    }
  },

  showToast(msg, type = "success") {
    const toast = document.getElementById('editor-toast');
    if (!toast) return;
    toast.className = `editor-toast ${type} show`;
    toast.textContent = msg;
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
  },

  // -------------------------------------------------------------
  // MATRIX CALCULATION (STRICTLY USES BASE WEIGHTS FOR ALL CANVASES)
  // -------------------------------------------------------------
  calculateAdjacencyMatrix() {
    const allNodes = this.allCanvasNodeIds;
    const N = allNodes.length;
    const indexMap = new Map();
    allNodes.forEach((nid, i) => indexMap.set(nid, i));

    const matrix = Array.from({ length: N }, (_, r) =>
      Array.from({ length: N }, (_, c) => (r === c ? 0 : -1))
    );

    this.edges.forEach(e => {
      const i = indexMap.get(e.from);
      const j = indexMap.get(e.to);
      if (i !== undefined && j !== undefined) {
        const p1 = this.positions.get(e.from) || { x: 0, y: 0 };
        const p2 = this.positions.get(e.to) || { x: 0, y: 0 };
        const baseDist = Math.round(e.base_distance !== undefined ? e.base_distance : Math.hypot(p2.x - p1.x, p2.y - p1.y));
        matrix[i][j] = baseDist;
        matrix[j][i] = baseDist;
      }
    });

    return matrix;
  },

  renderMatrixTable() {
    const container = document.getElementById('matrix-table-wrapper');
    if (!container) return;

    const allNodes = this.allCanvasNodeIds;
    const N = allNodes.length;
    const matrix = this.calculateAdjacencyMatrix();
    const emptyOverlay = document.getElementById('editor-empty-overlay');

    if (N === 0) {
      container.innerHTML = '<div class="matrix-empty-msg">No nodes configured on canvas.<br>Right-click empty space or place from <strong>Unconfigured Nodes</strong> tray.</div>';
      const statsEl = document.getElementById('matrix-stats-summary');
      if (statsEl) statsEl.textContent = `Empty Matrix (0 Nodes)`;
      if (emptyOverlay) emptyOverlay.style.display = 'flex';
      return;
    }

    if (emptyOverlay) emptyOverlay.style.display = 'none';

    let html = '<table class="matrix-table">';
    html += '<thead><tr><th>Node</th>';
    allNodes.forEach(nid => { html += `<th>${nid}</th>`; });
    html += '</tr></thead><tbody>';

    allNodes.forEach((rowNode, r) => {
      html += `<tr><td class="row-header">${rowNode}</td>`;
      for (let c = 0; c < N; c++) {
        const val = matrix[r][c];
        if (r === c) {
          html += `<td class="cell-diag">0</td>`;
        } else if (val === -1) {
          html += `<td class="cell-inaccessible">-1</td>`;
        } else {
          html += `<td class="cell-connected">${val}</td>`;
        }
      }
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    if (this.exitNodes.length > 0 || this.junctionNodes.length > 0) {
      const exitLabels = this.exitNodes.map(id => id === this.mainEntranceId ? `✓ ${id} (MAIN ENTRANCE)` : id);
      container.innerHTML += `<div style="margin-top:8px; color:#a6e3a1; font-size:11px; font-family:'JetBrains Mono',monospace;">Exits: ${exitLabels.join(', ')} | Junctions: ${this.junctionNodes.join(', ')}</div>`;
    }

    const statsEl = document.getElementById('matrix-stats-summary');
    if (statsEl) {
      statsEl.textContent = `Size: ${N}×${N} Base Matrix (${this.edges.length} links, ${this.exitNodes.length} exits, ${this.junctionNodes.length} junctions${this.mainEntranceId ? ', 1 Main Entrance' : ''})`;
    }
  },

  // -------------------------------------------------------------
  // GRAPH EDITING OPERATIONS & EDIT NODE ID
  // -------------------------------------------------------------
  promptAddNode(defaultX = 0, defaultY = 0) {
    const defaultId = `NODE-${this.nodes.length + 1}`;
    const inputId = prompt(`Enter Unique Node ID for new sensor node:`, defaultId);
    if (!inputId) return;

    const cleanId = inputId.trim().toUpperCase();
    if (!cleanId) return;

    if (this.allCanvasNodeIds.includes(cleanId)) {
      alert(`Node ID "${cleanId}" is already placed on canvas!`);
      return;
    }

    this.unconfiguredNodes = this.unconfiguredNodes.filter(n => n.node_id !== cleanId);
    this.nodes.push(cleanId);
    this.positions.set(cleanId, { x: Math.round(defaultX), y: Math.round(defaultY) });

    this.triggerMemoryChange();
    this.showToast(`Added sensor node: ${cleanId}`, "success");
  },

  promptAddExit(defaultX = 0, defaultY = 0) {
    const defaultId = `EXIT-${this.exitNodes.length + 1}`;
    const inputId = prompt(`Enter unique Exit ID:`, defaultId);
    if (!inputId) return;

    const cleanId = inputId.trim().toUpperCase();
    if (!cleanId) return;

    if (this.allCanvasNodeIds.includes(cleanId)) {
      alert(`ID "${cleanId}" is already on canvas!`);
      return;
    }

    this.exitNodes.push(cleanId);
    this.positions.set(cleanId, { x: Math.round(defaultX), y: Math.round(defaultY) });

    if (!this.mainEntranceId) {
      this.mainEntranceId = cleanId;
    }

    this.triggerMemoryChange();
    this.showToast(`Added exit point: ${cleanId}`, "success");
  },

  promptAddJunction(defaultX = 0, defaultY = 0) {
    let index = 1;
    let autoId = `JUNC-${index}`;
    while (this.allCanvasNodeIds.includes(autoId)) {
      index++;
      autoId = `JUNC-${index}`;
    }

    this.junctionNodes.push(autoId);
    this.positions.set(autoId, { x: Math.round(defaultX), y: Math.round(defaultY) });

    this.triggerMemoryChange();
    this.showToast(`Added Junction node`, "success");
  },

  promptEditNodeId(oldId) {
    const isExit = this.exitNodes.includes(oldId);
    const isJunc = this.junctionNodes.includes(oldId);

    // Junction nodes do not require ID editing
    if (isJunc) return;

    const typeStr = isExit ? 'Exit' : 'Sensor';
    const inputId = prompt(`Edit Node ID for ${typeStr} "${oldId}":`, oldId);
    if (!inputId) return;

    const cleanId = inputId.trim().toUpperCase();
    if (!cleanId || cleanId === oldId) return;

    if (this.allCanvasNodeIds.includes(cleanId)) {
      alert(`Node ID "${cleanId}" is already placed on canvas!`);
      return;
    }

    // Rename in nodes list
    if (isExit) {
      this.exitNodes = this.exitNodes.map(n => n === oldId ? cleanId : n);
      if (this.mainEntranceId === oldId) this.mainEntranceId = cleanId;
    } else {
      this.nodes = this.nodes.map(n => n === oldId ? cleanId : n);
    }

    // Rename in positions Map
    const pos = this.positions.get(oldId);
    this.positions.delete(oldId);
    if (pos) this.positions.set(cleanId, pos);

    // Rename in edges
    this.edges.forEach(e => {
      if (e.from === oldId) e.from = cleanId;
      if (e.to === oldId) e.to = cleanId;
    });

    // Rename in unconfigured list if present
    this.unconfiguredNodes.forEach(n => {
      if (n.node_id === oldId) n.node_id = cleanId;
    });

    this.triggerMemoryChange();
    this.showToast(`Renamed Node: ${oldId} ➔ ${cleanId}`, "success");
  },

  toggleMainEntrance(exitId) {
    if (this.mainEntranceId === exitId) {
      this.mainEntranceId = null;
      this.showToast(`Unset main entrance designation`, "info");
    } else {
      this.mainEntranceId = exitId;
      this.showToast(`Designated ${exitId} as PRIMARY MAIN ENTRANCE`, "success");
    }
    this.triggerMemoryChange();
  },

  getNodeEdges(nid) {
    return this.edges.filter(e => e.from === nid || e.to === nid);
  },

  getNodeDisplaySide(edge, nid) {
    if (!edge) return "Front";
    if (edge.from === nid) {
      return (edge.from_display === "Back" || edge.from_display === "B") ? "Back" : "Front";
    }
    if (edge.to === nid) {
      return (edge.to_display === "Back" || edge.to_display === "B") ? "Back" : "Front";
    }
    return "Front";
  },

  setNodeDisplaySide(edge, nid, side) {
    if (!edge) return;
    const val = (side === "Back" || side === "B") ? "Back" : "Front";
    if (edge.from === nid) edge.from_display = val;
    if (edge.to === nid) edge.to_display = val;
  },

  toggleEdgeSideAtNode(edge, nid) {
    if (!edge) return "Front";
    const curSide = this.getNodeDisplaySide(edge, nid);
    const newSide = (curSide === "Back") ? "Front" : "Back";
    this.setNodeDisplaySide(edge, nid, newSide);

    // If node is a sensor node and has 2 links, enforce one Front and one Back (never Front-Front or Back-Back)
    if (this.nodes.includes(nid)) {
      const otherEdges = this.getNodeEdges(nid).filter(e => e !== edge);
      if (otherEdges.length > 0) {
        const oppSide = (newSide === "Back") ? "Front" : "Back";
        otherEdges.forEach(oe => this.setNodeDisplaySide(oe, nid, oppSide));
      }
    }
    return newSide;
  },

  toggleEdge(nodeA, nodeB) {
    if (nodeA === nodeB) return;

    const idx = this.edges.findIndex(e =>
      (e.from === nodeA && e.to === nodeB) || (e.from === nodeB && e.to === nodeA)
    );

    if (idx >= 0) {
      this.edges.splice(idx, 1);
      this.showToast(`Removed link: ${nodeA} ↔ ${nodeB}`, "info");
      this.triggerMemoryChange();
      return;
    }

    // Maximum 2 connections allowed for sensor nodes
    if (this.nodes.includes(nodeA)) {
      const connA = this.getNodeEdges(nodeA);
      if (connA.length >= 2) {
        this.showToast(`Node ${nodeA} already has maximum 2 connections (Front & Back)`, "error");
        return;
      }
    }

    if (this.nodes.includes(nodeB)) {
      const connB = this.getNodeEdges(nodeB);
      if (connB.length >= 2) {
        this.showToast(`Node ${nodeB} already has maximum 2 connections (Front & Back)`, "error");
        return;
      }
    }

    // Determine display side for nodeA (if 1st link is Front, 2nd is Back; if 1st is Back, 2nd is Front)
    let sideA = "Front";
    if (this.nodes.includes(nodeA)) {
      const connA = this.getNodeEdges(nodeA);
      if (connA.length === 1) {
        const existingSide = this.getNodeDisplaySide(connA[0], nodeA);
        sideA = (existingSide === "Back") ? "Front" : "Back";
      }
    }

    // Determine display side for nodeB
    let sideB = "Front";
    if (this.nodes.includes(nodeB)) {
      const connB = this.getNodeEdges(nodeB);
      if (connB.length === 1) {
        const existingSide = this.getNodeDisplaySide(connB[0], nodeB);
        sideB = (existingSide === "Back") ? "Front" : "Back";
      }
    }

    const p1 = this.positions.get(nodeA) || { x: 0, y: 0 };
    const p2 = this.positions.get(nodeB) || { x: 0, y: 0 };
    const dist = Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y));

    this.edges.push({
      from: nodeA,
      to: nodeB,
      from_display: sideA,
      to_display: sideB,
      base_distance: dist,
      distance: dist
    });

    this.showToast(`Connected ${nodeA} (${sideA}) ↔ ${nodeB} (${sideB}) [${dist}m]`, "success");
    this.triggerMemoryChange();
  },

  deleteNode(nid) {
    const isSensor = this.nodes.includes(nid);
    const isExit = this.exitNodes.includes(nid);
    const isJunc = this.junctionNodes.includes(nid);

    if (isSensor) {
      this.nodes = this.nodes.filter(n => n !== nid);
      if (!this.unconfiguredNodes.some(n => n.node_id === nid)) {
        this.unconfiguredNodes.push({
          node_id: nid,
          location: `Corridor Node ${nid}`
        });
      }
    } else if (isExit) {
      this.exitNodes = this.exitNodes.filter(n => n !== nid);
      if (this.mainEntranceId === nid) this.mainEntranceId = null;
    } else if (isJunc) {
      this.junctionNodes = this.junctionNodes.filter(n => n !== nid);
    }

    this.positions.delete(nid);
    this.edges = this.edges.filter(e => e.from !== nid && e.to !== nid);

    this.triggerMemoryChange();
    this.showToast(`Deleted item from canvas`, "info");
  },

  deleteEdge(edgeObj) {
    if (!edgeObj) return;
    this.edges = this.edges.filter(e => e !== edgeObj && !(e.from === edgeObj.from && e.to === edgeObj.to));
    this.triggerMemoryChange();
    this.showToast(`Deleted link: ${edgeObj.from} ↔ ${edgeObj.to}`, "info");
  },

  // -------------------------------------------------------------
  // CONTEXT MENU HANDLING
  // -------------------------------------------------------------
  onContextMenu(e) {
    e.preventDefault();
    const pos = this.getCanvasCoords(e);
    this.ctxTargetPos = pos;

    // Check node first so right-clicking a node reliably targets the node
    const hitNode = this.findNodeAt(pos);
    let hitEdge = null;
    if (!hitNode) {
      const hitBadge = this.findEdgeDisplayBadgeAt(pos);
      hitEdge = hitBadge ? hitBadge.edge : this.findEdgeAt(pos);
    }

    this.ctxTargetNode = hitNode;
    this.ctxTargetEdge = hitEdge;

    this.showContextMenu(e.clientX, e.clientY, hitNode, hitEdge);
  },

  showContextMenu(screenX, screenY, hitNode, hitEdge) {
    const menu = document.getElementById('editor-context-menu');
    const title = document.getElementById('ctx-menu-title');
    const btnAddNode = document.getElementById('ctx-btn-add-node');
    const btnAddExit = document.getElementById('ctx-btn-add-exit');
    const btnAddJunction = document.getElementById('ctx-btn-add-junction');
    const btnEditId = document.getElementById('ctx-btn-edit-id');
    const btnRotate = document.getElementById('ctx-btn-rotate');
    const btnDelete = document.getElementById('ctx-btn-delete');

    if (!menu) return;

    if (title) title.textContent = 'OPTIONS';

    btnAddNode.classList.remove('disabled');
    btnAddExit.classList.remove('disabled');
    if (btnAddJunction) btnAddJunction.classList.remove('disabled');
    if (btnEditId) btnEditId.classList.remove('disabled');
    if (btnRotate) btnRotate.classList.remove('disabled');
    btnDelete.classList.remove('disabled');

    btnDelete.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete';

    if (hitNode) {
      // Right-clicked a Node (Sensor, Exit, or Junction)
      btnAddNode.classList.add('disabled');
      btnAddExit.classList.add('disabled');
      if (btnAddJunction) btnAddJunction.classList.add('disabled');

      if (this.junctionNodes.includes(hitNode) && btnEditId) {
        btnEditId.classList.add('disabled');
      }

      // Rotate is enabled specifically for sensor nodes
      if (btnRotate) {
        if (this.nodes.includes(hitNode)) {
          btnRotate.classList.remove('disabled');
        } else {
          btnRotate.classList.add('disabled');
        }
      }
    } else if (hitEdge) {
      // Right-clicked an Edge
      btnAddNode.classList.add('disabled');
      btnAddExit.classList.add('disabled');
      if (btnAddJunction) btnAddJunction.classList.add('disabled');
      if (btnEditId) btnEditId.classList.add('disabled');
      if (btnRotate) btnRotate.classList.add('disabled');
    } else {
      // Right-clicked empty canvas space
      if (btnEditId) btnEditId.classList.add('disabled');
      if (btnRotate) btnRotate.classList.add('disabled');
      btnDelete.classList.add('disabled');
    }

    menu.style.display = 'flex';
    const menuRect = menu.getBoundingClientRect();
    const windowW = window.innerWidth;
    const windowH = window.innerHeight;

    let posX = screenX;
    let posY = screenY;

    if (posX + menuRect.width > windowW - 6) posX = windowW - menuRect.width - 6;
    if (posY + menuRect.height > windowH - 6) posY = windowH - menuRect.height - 6;

    menu.style.left = `${Math.max(4, posX)}px`;
    menu.style.top = `${Math.max(4, posY)}px`;
  },

  hideContextMenu() {
    const menu = document.getElementById('editor-context-menu');
    if (menu) menu.style.display = 'none';
  },

  handleCtxAction(action) {
    this.hideContextMenu();

    if (action === 'add-node') {
      const pos = this.ctxTargetPos || { x: 0, y: 0 };
      this.promptAddNode(pos.x, pos.y);
    } else if (action === 'add-exit') {
      const pos = this.ctxTargetPos || { x: 0, y: 0 };
      this.promptAddExit(pos.x, pos.y);
    } else if (action === 'add-junction') {
      const pos = this.ctxTargetPos || { x: 0, y: 0 };
      this.promptAddJunction(pos.x, pos.y);
    } else if (action === 'edit-id') {
      if (this.ctxTargetNode && !this.junctionNodes.includes(this.ctxTargetNode)) {
        this.promptEditNodeId(this.ctxTargetNode);
      }
    } else if (action === 'rotate') {
      if (this.ctxTargetNode && this.nodes.includes(this.ctxTargetNode)) {
        this.rotateNode(this.ctxTargetNode);
      }
    } else if (action === 'delete') {
      if (this.ctxTargetNode) {
        this.deleteNode(this.ctxTargetNode);
      } else if (this.ctxTargetEdge) {
        this.deleteEdge(this.ctxTargetEdge);
      }
    }
  },

  // -------------------------------------------------------------
  // CANVAS RENDERING LOOP
  // -------------------------------------------------------------
  renderLoop() {
    this.draw();
    requestAnimationFrame(this.renderLoop);
  },

  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // 1. Blueprint Grid
    this.drawBlueprintGrid(ctx);

    // 2. Edges (focused with bright highlight & thick stroke on hover)
    this.drawEdges(ctx);

    // 3. Rubberband Connection Line (Follows Mouse)
    this.drawActiveConnectLine(ctx);

    // 4. Sensor Nodes
    this.drawNodes(ctx);

    // 5. Exit Nodes (with Main Entrance tick badge)
    this.drawExitNodes(ctx);

    // 6. Purely Software Junction Nodes
    this.drawJunctionNodes(ctx);

    // 7. Display Orientation Badges (F / B) rendered on top at the boundary of node boxes
    this.drawDisplayBadges(ctx);

    ctx.restore();
  },

  drawBlueprintGrid(ctx) {
    const gridSize = 40;
    const extent = 1200;

    ctx.strokeStyle = "rgba(70, 100, 140, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -extent; x <= extent; x += gridSize) {
      ctx.moveTo(x, -extent);
      ctx.lineTo(x, extent);
    }
    for (let y = -extent; y <= extent; y += gridSize) {
      ctx.moveTo(-extent, y);
      ctx.lineTo(extent, y);
    }
    ctx.stroke();

    ctx.strokeStyle = "rgba(0, 216, 255, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-extent, 0); ctx.lineTo(extent, 0);
    ctx.moveTo(0, -extent); ctx.lineTo(0, extent);
    ctx.stroke();
  },

  isNoDisplayNode(nid) {
    if (!nid) return true;
    return this.junctionNodes.includes(nid) || this.exitNodes.includes(nid);
  },

  getNodeBoundaryPoint(p, ux, uy, w = 96, h = 44) {
    const hw = w / 2;
    const hh = h / 2;
    const absUx = Math.abs(ux);
    const absUy = Math.abs(uy);
    
    let t = 40;
    if (absUx > 0.0001 && absUy > 0.0001) {
      t = Math.min(hw / absUx, hh / absUy);
    } else if (absUx > 0.0001) {
      t = hw / absUx;
    } else if (absUy > 0.0001) {
      t = hh / absUy;
    }
    return {
      x: p.x + ux * t,
      y: p.y + uy * t
    };
  },

  drawEdges(ctx) {
    this.edges.forEach(e => {
      const p1 = this.positions.get(e.from);
      const p2 = this.positions.get(e.to);
      if (!p1 || !p2) return;

      const isToExit = this.exitNodes.includes(e.from) || this.exitNodes.includes(e.to);
      const isHovered = (this.hoveredEdge === e);

      ctx.save();

      if (isHovered) {
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = isToExit ? '#10b981' : '#3b82f6';
        ctx.lineWidth = 2.5;
      }

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const baseDist = Math.round(e.base_distance !== undefined ? e.base_distance : Math.hypot(p2.x - p1.x, p2.y - p1.y));

      ctx.fillStyle = '#151822';
      ctx.strokeStyle = isHovered ? '#f8fafc' : (isToExit ? '#10b981' : '#282e3f');
      ctx.lineWidth = isHovered ? 1.5 : 1;
      ctx.beginPath();
      ctx.roundRect(midX - 22, midY - 9, 44, 18, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isHovered ? '#f8fafc' : (isToExit ? '#10b981' : '#60a5fa');
      ctx.font = "600 9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${baseDist}m`, midX, midY + 3);
    });
  },

  drawDisplayBadges(ctx) {
    this.edges.forEach(e => {
      const p1 = this.positions.get(e.from);
      const p2 = this.positions.get(e.to);
      if (!p1 || !p2) return;

      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist <= 30) return;

      const ux = (p2.x - p1.x) / dist;
      const uy = (p2.y - p1.y) / dist;

      const fromPos = this.getNodeBoundaryPoint(p1, ux, uy);
      const toPos = this.getNodeBoundaryPoint(p2, -ux, -uy);

      const fromSide = e.from_display || "Front";
      const toSide = e.to_display || "Front";
      const isHovered = (this.hoveredEdge === e);

      const drawBadge = (pos, side) => {
        const isFront = (side === "Front" || side === "A");
        const label = isFront ? "F" : "B";
        const radius = 9;

        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#151822';
        ctx.fill();
        ctx.strokeStyle = isFront ? "#3b82f6" : "#f59e0b";
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();

        ctx.fillStyle = isFront ? "#60a5fa" : "#fbbf24";
        ctx.font = "600 10px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, pos.x, pos.y + 0.5);
        ctx.restore();
      };

      const isFromNoDisplay = this.isNoDisplayNode(e.from);
      const isToNoDisplay = this.isNoDisplayNode(e.to);

      if (!isFromNoDisplay) drawBadge(fromPos, fromSide);
      if (!isToNoDisplay) drawBadge(toPos, toSide);
    });
  },

  drawActiveConnectLine(ctx) {
    if (this.connectSourceNode) {
      const p1 = this.positions.get(this.connectSourceNode);
      if (!p1) return;

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(this.mouseCanvasPos.x, this.mouseCanvasPos.y);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  },

  drawNodes(ctx) {
    this.nodes.forEach(nid => {
      const p = this.positions.get(nid) || { x: 0, y: 0 };
      const isSelected = (this.connectSourceNode === nid);
      const isHovered = (this.hoveredNode === nid);

      const w = 96;
      const h = 44;
      ctx.fillStyle = '#151822';
      ctx.strokeStyle = isSelected ? '#10b981' : (isHovered ? '#3b82f6' : '#282e3f');
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(p.x - w/2, p.y - h/2, w, h, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f8fafc';
      ctx.font = "600 11px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(nid, p.x, p.y - 4);

      const connCount = this.edges.filter(e => e.from === nid || e.to === nid).length;
      ctx.fillStyle = connCount > 0 ? '#10b981' : '#64748b';
      ctx.font = "600 9px 'JetBrains Mono', monospace";
      ctx.fillText(`${connCount} Links`, p.x, p.y + 11);
    });
  },

  drawExitNodes(ctx) {
    this.exitNodes.forEach(nid => {
      const p = this.positions.get(nid) || { x: 0, y: 0 };
      const isSelected = (this.connectSourceNode === nid);
      const isHovered = (this.hoveredNode === nid);
      const isMainEntrance = (this.mainEntranceId === nid);

      const size = 22;
      ctx.save();
      ctx.fillStyle = '#0f1f1a';
      ctx.strokeStyle = isMainEntrance ? '#10b981' : (isSelected ? '#10b981' : (isHovered ? '#3b82f6' : '#10b981'));
      ctx.lineWidth = isMainEntrance ? 2 : (isSelected ? 2 : 1);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - size * 1.6);
      ctx.lineTo(p.x + size * 2.8, p.y);
      ctx.lineTo(p.x, p.y + size * 1.6);
      ctx.lineTo(p.x - size * 2.8, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#10b981';
      ctx.font = "700 10px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText('EXIT', p.x, p.y - 5);

      ctx.fillStyle = '#f8fafc';
      ctx.font = "600 8px 'JetBrains Mono', monospace";
      ctx.fillText(nid, p.x, p.y + 8);

      if (isMainEntrance) {
        ctx.fillStyle = '#11141d';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(p.x - 44, p.y - 44, 88, 16, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#10b981';
        ctx.font = "600 8px 'Inter', sans-serif";
        ctx.fillText('MAIN ENTRANCE', p.x, p.y - 32);
      } else if (isHovered) {
        ctx.fillStyle = '#11141d';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(p.x - 46, p.y - 44, 92, 16, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#10b981';
        ctx.font = "600 8px 'Inter', sans-serif";
        ctx.fillText('[ Set Entrance ]', p.x, p.y - 32);
      }

      ctx.restore();
    });
  },

  drawJunctionNodes(ctx) {
    this.junctionNodes.forEach(nid => {
      const p = this.positions.get(nid) || { x: 0, y: 0 };
      const isSelected = (this.connectSourceNode === nid);
      const isHovered = (this.hoveredNode === nid);

      ctx.save();
      ctx.fillStyle = '#111726';
      ctx.strokeStyle = isSelected ? '#10b981' : (isHovered ? '#f8fafc' : '#3b82f6');
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#3b82f6';
      ctx.font = "600 13px 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText('+', p.x, p.y);

      if (isHovered) {
        ctx.fillStyle = '#11141d';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(p.x - 28, p.y - 36, 56, 16, 4);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#60a5fa';
        ctx.font = "600 8px 'Inter', sans-serif";
        ctx.fillText('Junction', p.x, p.y - 24);
      }

      ctx.restore();
    });
  },

  // -------------------------------------------------------------
  // MOUSE INTERACTION & HIT TESTING
  // -------------------------------------------------------------
  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.offsetX) / this.scale,
      y: (e.clientY - rect.top - this.offsetY) / this.scale
    };
  },

  findNodeAt(pos) {
    for (const nid of this.junctionNodes) {
      const p = this.positions.get(nid);
      if (p && Math.hypot(pos.x - p.x, pos.y - p.y) <= 24) {
        return nid;
      }
    }
    for (const nid of this.exitNodes) {
      const p = this.positions.get(nid);
      if (p && Math.abs(pos.x - p.x) <= 62 && Math.abs(pos.y - p.y) <= 36) {
        return nid;
      }
    }
    for (const nid of this.nodes) {
      const p = this.positions.get(nid);
      if (p && Math.abs(pos.x - p.x) <= 48 && Math.abs(pos.y - p.y) <= 22) {
        return nid;
      }
    }
    return null;
  },

  findEdgeAt(pos) {
    const threshold = Math.max(16, 24 / this.scale);
    for (const e of this.edges) {
      const p1 = this.positions.get(e.from);
      const p2 = this.positions.get(e.to);
      if (!p1 || !p2) continue;
      const d = this.distToSegment(pos, p1, p2);
      if (d <= threshold) return e;
    }
    return null;
  },

  findEdgeDisplayBadgeAt(pos) {
    for (const e of this.edges) {
      const p1 = this.positions.get(e.from);
      const p2 = this.positions.get(e.to);
      if (!p1 || !p2) continue;

      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist <= 30) continue;

      const ux = (p2.x - p1.x) / dist;
      const uy = (p2.y - p1.y) / dist;

      const isFromNoDisplay = this.isNoDisplayNode(e.from);
      const isToNoDisplay = this.isNoDisplayNode(e.to);

      if (!isFromNoDisplay) {
        const fromPos = this.getNodeBoundaryPoint(p1, ux, uy);
        if (Math.hypot(pos.x - fromPos.x, pos.y - fromPos.y) <= 15) {
          return { edge: e, target: "from" };
        }
      }

      if (!isToNoDisplay) {
        const toPos = this.getNodeBoundaryPoint(p2, -ux, -uy);
        if (Math.hypot(pos.x - toPos.x, pos.y - toPos.y) <= 15) {
          return { edge: e, target: "to" };
        }
      }
    }
    return null;
  },

  distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  },

  rotateNode(nid) {
    if (!this.nodes.includes(nid)) return;

    const connected = this.getNodeEdges(nid);
    if (connected.length === 0) {
      this.showToast(`Node ${nid} has no connected links to rotate`, "info");
      return;
    }

    connected.forEach(e => {
      const curSide = this.getNodeDisplaySide(e, nid);
      const oppSide = (curSide === "Back") ? "Front" : "Back";
      this.setNodeDisplaySide(e, nid, oppSide);
    });

    this.triggerMemoryChange();
    this.showToast(`Rotated ${nid}: Swapped Front and Back links`, "success");
  },

  onMouseDown(e) {
    this.hideContextMenu();
    const pos = this.getCanvasCoords(e);

    if (e.button === 0) { // Left click
      const hitBadge = this.findEdgeDisplayBadgeAt(pos);
      if (hitBadge) {
        const { edge, target } = hitBadge;
        const nid = (target === 'from') ? edge.from : edge.to;
        const newSide = this.toggleEdgeSideAtNode(edge, nid);
        this.showToast(`Set ${nid} link side to ${newSide}`, "info");
        this.triggerMemoryChange();
        return;
      }

      const hitNode = this.findNodeAt(pos);

      // Check if clicked the hover tick button on exit node
      if (hitNode && this.exitNodes.includes(hitNode)) {
        const p = this.positions.get(hitNode);
        if (p && Math.abs(pos.x - p.x) <= 45 && pos.y >= p.y - 50 && pos.y <= p.y - 25) {
          this.toggleMainEntrance(hitNode);
          return;
        }
      }

      if (this.connectSourceNode) {
        if (hitNode && hitNode !== this.connectSourceNode) {
          this.toggleEdge(this.connectSourceNode, hitNode);
        }
        this.connectSourceNode = null;
        return;
      }

      if (hitNode) {
        this.mouseDownNode = hitNode;
        this.mouseDownPos = { x: e.clientX, y: e.clientY };
        this.draggedNode = hitNode;
      } else {
        this.isPanning = true;
        this.panStart = { x: e.clientX, y: e.clientY };
      }
    }
  },

  onMouseMove(e) {
    const pos = this.getCanvasCoords(e);
    this.mouseCanvasPos = pos;

    if (this.isPanning) {
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;
      this.offsetX += dx;
      this.offsetY += dy;
      this.panStart = { x: e.clientX, y: e.clientY };
      return;
    }

    if (this.draggedNode) {
      this.positions.set(this.draggedNode, {
        x: Math.round(pos.x),
        y: Math.round(pos.y)
      });

      const movedId = this.draggedNode;
      this.edges.forEach(edge => {
        if (edge.from === movedId || edge.to === movedId) {
          const p1 = this.positions.get(edge.from) || { x: 0, y: 0 };
          const p2 = this.positions.get(edge.to) || { x: 0, y: 0 };
          const dist = Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y));
          edge.base_distance = dist;
          edge.distance = dist;
        }
      });

      this.triggerMemoryChange();
      return;
    }

    this.hoveredNode = this.findNodeAt(pos);
    this.hoveredEdge = this.hoveredNode ? null : this.findEdgeAt(pos);
  },

  onMouseUp(e) {
    this.isPanning = false;

    if (this.mouseDownNode) {
      const distMoved = Math.hypot(e.clientX - this.mouseDownPos.x, e.clientY - this.mouseDownPos.y);
      if (distMoved < 5) {
        this.connectSourceNode = this.mouseDownNode;
        this.showToast(`Rubberband link started from ${this.connectSourceNode}. Click target node to connect.`, "info");
      }
    }

    this.mouseDownNode = null;
    this.draggedNode = null;
  },

  onDblClick(e) {
    // Double click edit removed — use right-click context menu Edit Node ID
  },

  onWheel(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    this.scale = Math.max(0.35, Math.min(2.8, this.scale * zoomFactor));
  },

  resetView() {
    this.scale = 1.0;
    this.offsetX = this.width / 2;
    this.offsetY = this.height / 2;
  }
};

window.LayoutEditor = LayoutEditor;
