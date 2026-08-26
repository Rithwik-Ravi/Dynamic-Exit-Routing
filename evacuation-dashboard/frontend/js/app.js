/**
 * app.js - Master Application Controller
 * Manages Live Monitoring & Layout Editor tabs, /state polling, and telemetry inspection
 */

// Global State
window.allNodes = [];
window.selectedNodeData = null;
let activeMainTab = 'monitor'; // 'monitor' or 'editor'
let currentMode = 'live'; // 'live' or 'test'
let pollIntervalId = null;
let lastKnownHazards = 0;

// Fetch matrix edges + exits and push them to Graph2DView
async function loadMatrixEdgesForMonitor(mode) {
  try {
    const res = await fetch(`/api/graph/load?mode=${mode}&_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      if (mode === 'live') {
        Graph2DView.clearGraph();
      }
      return;
    }
    const data = await res.json();
    const edges = data.edges || [];
    const exits = (data.nodes || [])
      .filter(n => (n.node_type === 'exit' || (typeof n.id === 'string' && n.id.startsWith('EXIT'))))
      .map(n => n.id || n.node_id);
    const junctions = (data.nodes || [])
      .filter(n => (n.node_type === 'junction' || (typeof n.id === 'string' && n.id.startsWith('JUNC'))))
      .map(n => n.id || n.node_id);

    // Clear previous node positions before loading new mode positions
    Graph2DView.nodePositions.clear();

    // Synchronize ALL node positions (sensors + exits + junctions) from saved layout matrix
    if (data.node_positions) {
      for (const [nid, pos] of Object.entries(data.node_positions)) {
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
          Graph2DView.nodePositions.set(nid, { x: pos.x, y: pos.y });
        }
      }
    }

    Graph2DView.updateEdgesFromMatrix(edges, exits, data.main_entrance_id || data.main_exit_id, junctions);
  } catch (e) {
    if (mode === 'live') {
      Graph2DView.clearGraph();
    }
  }
}

// Web Audio Siren
let audioCtx = null;

// ==========================================================================
// INITIALIZATION
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Views
  Graph2DView.init('graph2d-canvas', 'graph-container');
  LayoutEditor.init('editor-canvas', 'editor-canvas-container');
  MatrixSim.init();

  // 2. Start Live Clock
  startClock();

  // 3. Start Polling /state from Flask
  startPollingState();

  // 4. Load matrix edges for live monitoring
  loadMatrixEdgesForMonitor(currentMode);

  // 5. Initial Incident Log
  logIncident("System initialized. Monitoring nodes on /state.", "info");
});

// ==========================================================================
// TAB SWITCHING (Live Monitoring vs Layout Editor)
// ==========================================================================
window.switchMainTab = function(tabName) {
  activeMainTab = tabName;

  document.getElementById('tab-btn-monitor').classList.toggle('active', tabName === 'monitor');
  document.getElementById('tab-btn-editor').classList.toggle('active', tabName === 'editor');

  document.getElementById('view-monitoring').classList.toggle('active', tabName === 'monitor');
  document.getElementById('view-editor').classList.toggle('active', tabName === 'editor');

  if (tabName === 'monitor') {
    Graph2DView.resize();
    loadMatrixEdgesForMonitor(currentMode);
    logIncident("Switched to Live Monitoring View.", "info");
  } else if (tabName === 'editor') {
    LayoutEditor.resize();
    LayoutEditor.loadGraphFromDisk(currentMode);
    logIncident("Switched to Layout & Graph Editor.", "info");
  }
};

// ==========================================================================
// DATA SOURCE MODE TOGGLE (LIVE HARDWARE vs TESTING DICT)
// ==========================================================================
window.setMode = function(mode) {
  currentMode = mode;

  // 1. Immediately wipe the canvas and reset all graph state
  Graph2DView.clearGraph();
  window.allNodes = [];
  window.selectedNodeData = null;
  lastDictSignature = "";
  lastDictMode = mode;
  closeInspector();

  // 2. Update UI toggle buttons and indicators
  const btnLive = document.getElementById('btn-mode-live');
  const btnTest = document.getElementById('btn-mode-test');
  const modeTag = document.getElementById('graph-mode-tag');
  const modeKpi = document.getElementById('kpi-mode-label');

  if (mode === 'live') {
    btnLive.classList.add('active');
    btnTest.classList.remove('active');
    if (modeTag) {
      modeTag.className = 'toolbar-mode-tag';
      modeTag.innerHTML = '<i class="fa-solid fa-circle-dot"></i> SOURCE: LIVE HARDWARE (nodes dict)';
    }
    if (modeKpi) modeKpi.textContent = 'Live nodes dict';
    logIncident("Switched to LIVE mode. Canvas cleared.", "info");
  } else {
    btnLive.classList.remove('active');
    btnTest.classList.add('active');
    if (modeTag) {
      modeTag.className = 'toolbar-mode-tag test-active';
      modeTag.innerHTML = '<i class="fa-solid fa-vial"></i> SOURCE: TESTING MODE (test_nodes dict)';
    }
    if (modeKpi) modeKpi.textContent = 'test_nodes dict';
    const emptyEl = document.getElementById('empty-state');
    if (emptyEl) emptyEl.style.display = 'none';

    logIncident("Switched to TEST mode. Canvas cleared and reloading test graph.", "warning");
  }

  // 3. Reload layout and poll state for the selected mode
  if (activeMainTab === 'monitor') {
    reloadMonitoringScene();
  } else if (activeMainTab === 'editor' && window.LayoutEditor) {
    LayoutEditor.loadGraphFromDisk(mode);
  }
};

// ==========================================================================
// CONTINUOUS STATE POLLING (/state)
// ==========================================================================
function startPollingState() {
  pollStateNow();
  if (pollIntervalId) clearInterval(pollIntervalId);
  pollIntervalId = setInterval(pollStateNow, 500);
}

async function pollStateNow() {
  try {
    const url = `/state?mode=${currentMode}&_t=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    document.getElementById('conn-dot').style.background = 'var(--color-safe)';
    document.getElementById('conn-text').textContent = 'API: CONNECTED';

    handleStateUpdate(data);
  } catch (err) {
    document.getElementById('conn-dot').style.background = 'var(--color-danger)';
    document.getElementById('conn-text').textContent = 'API: DISCONNECTED';
  }
}

let lastDictSignature = "";
let lastDictMode = "";

function computeOverallStateSignature(data) {
  const nodes = data.nodes || [];
  const edges = data.edges || [];

  const nodeParts = nodes.map(n => 
    `${n.node_id}:${n.hazard_flag}:${n.congestion_level}:${n.blocked}:${n.next_hop}:${n.nearest_exit}:${n.display_a}:${n.display_b}:${n.people_count}:${n.temperature}:${n.smoke_ppm}`
  ).sort().join('|');

  const edgeParts = edges.map(e => 
    `${e.from}->${e.to}:${e.distance}:${e.reason || ''}`
  ).sort().join('|');

  return `${data.mode || currentMode}::NODES[${nodeParts}]::EDGES[${edgeParts}]`;
}

function handleStateUpdate(data) {
  const nodes = data.nodes || [];
  window.allNodes = nodes;

  const currentDictSig = data.dict_signature || computeOverallStateSignature(data);
  const currentModeFromData = data.mode || currentMode;

  const dictChanged = (lastDictSignature !== "" && (lastDictSignature !== currentDictSig || lastDictMode !== currentModeFromData));
  lastDictSignature = currentDictSig;
  lastDictMode = currentModeFromData;

  // 1. Update 2D Graph View nodes and dynamic hybrid edges (ensuring empty arrays clear previous mode data)
  Graph2DView.updateData(nodes, currentMode, data.routing);
  Graph2DView.updateEdgesFromMatrix(
    data.edges || [],
    data.exits || [],
    data.main_entrance_id || data.main_exit_id,
    data.junctions || []
  );

  // 2. Trigger immediate scene reload & complete canvas redraw whenever dictionary changes (test or live)
  if (dictChanged) {
    loadMatrixEdgesForMonitor(currentMode);
    Graph2DView.resize();
    Graph2DView.draw();
    logIncident(`Dictionary (${currentModeFromData.toUpperCase()}) updated. Live scene reloaded.`, "info");
  }

  // 3. Update KPI Overall Statistics
  updateKPIStatistics(nodes);

  // 4. Update Selected Node in Inspector if open
  if (window.selectedNodeData) {
    const updated = nodes.find(n => n.node_id === window.selectedNodeData.node_id);
    if (updated) {
      window.selectedNodeData = updated;
      refreshInspectorData(updated);
    }
  }
}

// ==========================================================================
// KPI & SYSTEM STATUS UPDATES
// ==========================================================================
function updateKPIStatistics(nodes) {
  const total = nodes.length;
  const active = nodes.filter(n => n.active !== false).length;
  const hazards = nodes.filter(n => n.hazard_flag === 'CRITICAL' || n.hazard_flag === 'FIRE').length;
  const blocked = nodes.filter(n => n.blocked === true).length;
  const totalOccupants = nodes.reduce((sum, n) => sum + (n.people_count || 0), 0);

  let forwardSigns = 0;
  let stopSigns = 0;
  nodes.forEach(n => {
    if (n.display_a === 'FORWARD' || n.display_a === 'GO') forwardSigns++;
    else stopSigns++;
    if (n.display_b === 'FORWARD' || n.display_b === 'GO') forwardSigns++;
    else stopSigns++;
  });

  document.getElementById('kpi-online-count').textContent = active;
  document.getElementById('kpi-hazard-count').textContent = hazards;
  document.getElementById('kpi-blocked-count').textContent = blocked;
  document.getElementById('kpi-people-count').textContent = totalOccupants;
  document.getElementById('kpi-forward-signs').textContent = forwardSigns;
  document.getElementById('kpi-stop-signs').textContent = stopSigns;

  const threatBadge = document.getElementById('system-threat-badge');
  const statusText = document.getElementById('system-status-text');

  if (hazards > 0 || blocked > 0) {
    threatBadge.className = 'system-status-pill emergency';
    statusText.textContent = `ALERT: ${hazards} HAZARDS, ${blocked} BLOCKED`;
    document.getElementById('kpi-hazard-sub').textContent = 'Emergency routing active';

    if (hazards + blocked > lastKnownHazards) {
      triggerAudioSiren();
      logIncident(`Hazard / Blockage detected on /state!`, "danger");
    }
  } else {
    threatBadge.className = 'system-status-pill safe';
    statusText.textContent = 'STATUS: NORMAL';
    document.getElementById('kpi-hazard-sub').textContent = 'All corridors clear';
  }

  lastKnownHazards = hazards + blocked;
}

// ==========================================================================
// NODE SELECTION & TELEMETRY INSPECTOR
// ==========================================================================
window.selectNodeById = async function(nodeId) {
  let node = (window.allNodes || []).find(n => n.node_id === nodeId || n.id === nodeId);
  if (!node) {
    node = {
      node_id: nodeId,
      location: `Node ${nodeId}`,
      hazard_flag: "SAFE",
      congestion_level: "LOW",
      blocked: false,
      display_a: "FORWARD",
      display_b: "STOP",
      people_count: 0,
      area_ratio: 0.0,
      flow: 0,
      temperature: 24.0,
      smoke_ppm: 10.0
    };
  }

  window.selectedNodeData = node;
  const drawer = document.getElementById('node-inspector');
  if (drawer) drawer.classList.add('open');

  refreshInspectorData(node);

  // Fetch direct node status from server to guarantee fresh hazard & routing state
  try {
    const res = await fetch(`/node/${nodeId}/status?mode=${currentMode}&_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const freshData = await res.json();
      if (window.selectedNodeData && (window.selectedNodeData.node_id === nodeId || window.selectedNodeData.id === nodeId)) {
        window.selectedNodeData = { ...window.selectedNodeData, ...freshData };
        refreshInspectorData(window.selectedNodeData);
      }
    }
  } catch (e) {
    // Keep cached state
  }
};

// Current test override form state
let currentTestHazard = 'SAFE';
let currentTestCongestion = 'LOW';
let currentTestBlocked = false;

function refreshInspectorData(node) {
  document.getElementById('drawer-node-id').textContent = String(node.node_id);
  document.getElementById('drawer-node-location').textContent = node.location || `Node ${node.node_id}`;

  const isBlocked = (node.blocked === true);
  const isCritical = (node.hazard_flag === 'CRITICAL' || node.hazard_flag === 'FIRE');
  const statusBar = document.getElementById('drawer-status-bar');
  const statusText = document.getElementById('drawer-status-text');

  if (isCritical) {
    statusBar.className = 'node-status-bar danger';
    statusBar.style.borderColor = 'var(--color-danger)';
    statusBar.style.color = 'var(--color-danger)';
    statusText.textContent = 'FIRE / CRITICAL HAZARD DETECTED';
  } else if (isBlocked) {
    statusBar.className = 'node-status-bar danger';
    statusBar.style.borderColor = 'var(--color-danger)';
    statusBar.style.color = 'var(--color-danger)';
    statusText.textContent = 'CORRIDOR BLOCKED // STOP DIVERSION ACTIVE';
  } else if (node.hazard_flag === 'WARNING') {
    statusBar.className = 'node-status-bar';
    statusBar.style.borderColor = 'var(--color-warning)';
    statusBar.style.color = 'var(--color-warning)';
    statusText.textContent = 'HAZARD WARNING // SMOKE/HEAT ELEVATED';
  } else {
    statusBar.className = 'node-status-bar';
    statusBar.style.borderColor = 'var(--color-safe)';
    statusBar.style.color = 'var(--color-safe)';
    statusText.textContent = 'NODE HEALTHY // PASSAGE CLEAR';
  }

  // Evacuation Route Summary
  const routeCard = document.getElementById('drawer-route-card');
  if (routeCard) {
    const exitBadge = document.getElementById('drawer-route-exit');
    const nexthopEl = document.getElementById('drawer-route-nexthop');
    const sideEl = document.getElementById('drawer-route-side');
    const distEl = document.getElementById('drawer-route-dist');
    const pathEl = document.getElementById('drawer-route-path');

    if (node.nearest_exit) {
      exitBadge.textContent = String(node.nearest_exit);
      nexthopEl.textContent = String(node.next_hop || node.nearest_exit);
      const exitDir = node.exit_direction || node.direction_side;
      const sideText = exitDir ? `${exitDir} (${exitDir === 'Front' ? 'A:STOP, B:FWD' : 'A:FWD, B:STOP'})` : 'At Exit';
      sideEl.textContent = sideText;
      distEl.textContent = `${Math.round(node.nearest_exit_distance || 0)}m`;
      pathEl.textContent = (node.nearest_exit_path && node.nearest_exit_path.length > 0) ? node.nearest_exit_path.join(' → ') : node.nearest_exit;
    } else {
      exitBadge.textContent = 'NO EXIT';
      nexthopEl.textContent = 'TRAPPED / NONE';
      sideEl.textContent = 'BLOCKED';
      distEl.textContent = 'Impassable';
      pathEl.textContent = 'No safe path';
    }
  }

  // Test Simulation Card Controls
  const simCard = document.getElementById('test-simulation-card');
  if (simCard) {
    simCard.style.display = (currentMode === 'test') ? 'block' : 'none';

    currentTestHazard = node.hazard_flag || 'SAFE';
    currentTestCongestion = node.congestion_level || 'LOW';
    currentTestBlocked = isBlocked;

    updateTestControlUI(node);
  }

  // Display texts
  const dispAText = document.getElementById('drawer-display-a-text');
  const dispBText = document.getElementById('drawer-display-b-text');
  const isStopA = (node.display_a === 'STOP' || node.display_a === 'BLOCKED' || node.display_a === 'X');
  const isStopB = (node.display_b === 'STOP' || node.display_b === 'BLOCKED' || node.display_b === 'X');

  dispAText.textContent = `${node.display_a}`;
  dispAText.className = `unit-state ${isStopA ? 'stop' : ''}`;

  dispBText.textContent = `${node.display_b}`;
  dispBText.className = `unit-state ${isStopB ? 'stop' : ''}`;

  // Camera telemetry metrics
  document.getElementById('cam-people-val').textContent = node.people_count !== undefined ? node.people_count : 0;
  document.getElementById('cam-area-val').textContent = node.area_ratio !== undefined ? `${((node.area_ratio || 0) * 100).toFixed(1)}%` : '0.0%';
  document.getElementById('cam-flow-val').textContent = node.flow !== undefined ? `${node.flow >= 0 ? '+' : ''}${node.flow}` : '0';

  // Sensors
  const tempEl = document.getElementById('sensor-temp');
  if (node.temperature !== undefined && node.temperature !== null) {
    tempEl.textContent = Number(node.temperature).toFixed(1);
    const tempPct = Math.min(100, Math.max(10, (node.temperature / 80) * 100));
    document.getElementById('bar-temp').style.width = `${tempPct}%`;
    document.getElementById('bar-temp').style.backgroundColor = (node.temperature > 50) ? 'var(--color-danger)' : (node.temperature > 35 ? 'var(--color-warning)' : 'var(--color-cyan)');
  } else {
    tempEl.textContent = '--';
    document.getElementById('bar-temp').style.width = '0%';
  }

  const smokeEl = document.getElementById('sensor-smoke');
  if (node.smoke_ppm !== undefined && node.smoke_ppm !== null) {
    smokeEl.textContent = node.smoke_ppm;
    const smokePct = Math.min(100, (node.smoke_ppm / 300) * 100);
    document.getElementById('bar-smoke').style.width = `${smokePct}%`;
    document.getElementById('bar-smoke').style.backgroundColor = (node.smoke_ppm > 100) ? 'var(--color-danger)' : 'var(--color-cyan)';
  } else {
    smokeEl.textContent = '--';
    document.getElementById('bar-smoke').style.width = '0%';
  }

  const flameVal = document.getElementById('sensor-flame-val');
  const flameSub = document.getElementById('sensor-flame-sub');
  flameVal.textContent = node.hazard_flag || 'SAFE';
  if (isCritical) {
    flameVal.style.color = 'var(--color-danger)';
    flameSub.textContent = 'Critical Hazard Active';
  } else if (node.hazard_flag === 'WARNING') {
    flameVal.style.color = 'var(--color-warning)';
    flameSub.textContent = 'Warning Flag Active';
  } else {
    flameVal.style.color = 'var(--color-safe)';
    flameSub.textContent = 'No Hazard Detected';
  }

  const densityVal = document.getElementById('sensor-density-val');
  const blockedSub = document.getElementById('sensor-blocked-sub');
  if (isBlocked) {
    densityVal.textContent = 'BLOCKED';
    densityVal.style.color = 'var(--color-danger)';
    blockedSub.textContent = 'Corridor Blocked';
  } else {
    densityVal.textContent = 'OPEN';
    densityVal.style.color = 'var(--color-safe)';
    blockedSub.textContent = 'Clear for Passage';
  }

  // Specs
  document.getElementById('node-type-label').textContent = node.is_physical ? 'Physical ESP32 Node' : 'Virtual / Registered Node';
  document.getElementById('node-source-label').textContent = (currentMode === 'test') ? 'test_nodes dictionary' : 'nodes dictionary (live)';
}

function updateTestControlUI(node) {
  // Hazard buttons
  let hz = (node.hazard_flag || 'SAFE').toUpperCase();
  if (node.blocked || node.flame_detected || (node.temperature && node.temperature > 65) || (node.smoke_ppm && node.smoke_ppm > 200)) {
    hz = 'CRITICAL';
  } else if (hz !== 'CRITICAL' && ((node.temperature && node.temperature > 45) || (node.smoke_ppm && node.smoke_ppm > 80))) {
    hz = 'WARNING';
  }

  currentTestHazard = hz;
  const btnHzSafe = document.getElementById('btn-hz-safe');
  const btnHzWarn = document.getElementById('btn-hz-warning');
  const btnHzCrit = document.getElementById('btn-hz-critical');
  if (btnHzSafe) btnHzSafe.classList.toggle('active', hz === 'SAFE');
  if (btnHzWarn) btnHzWarn.classList.toggle('active', hz === 'WARNING');
  if (btnHzCrit) btnHzCrit.classList.toggle('active', hz === 'CRITICAL' || hz === 'FIRE');

  // Congestion buttons
  let cg = (node.congestion_level || 'LOW').toUpperCase();
  const ppl = (node.people_count !== undefined && node.people_count !== null) ? Number(node.people_count) : 0;
  if (cg === 'HIGH' || ppl > 6 || (node.area_ratio && node.area_ratio > 0.4)) {
    cg = 'HIGH';
  } else if (cg === 'MEDIUM' || cg === 'MODERATE' || ppl > 3 || (node.area_ratio && node.area_ratio > 0.2)) {
    cg = 'MEDIUM';
  } else {
    cg = 'LOW';
  }

  currentTestCongestion = cg;
  const btnCgLow = document.getElementById('btn-cg-low');
  const btnCgMed = document.getElementById('btn-cg-medium');
  const btnCgHigh = document.getElementById('btn-cg-high');
  if (btnCgLow) btnCgLow.classList.toggle('active', cg === 'LOW' || cg === 'NONE');
  if (btnCgMed) btnCgMed.classList.toggle('active', cg === 'MEDIUM' || cg === 'MODERATE');
  if (btnCgHigh) btnCgHigh.classList.toggle('active', cg === 'HIGH');

  // Blocked toggle
  const isBlocked = (node.blocked === true || hz === 'CRITICAL');
  currentTestBlocked = isBlocked;
  const blockedToggle = document.getElementById('test-toggle-blocked');
  if (blockedToggle) blockedToggle.checked = isBlocked;

  // Sliders
  const temp = (node.temperature !== undefined && node.temperature !== null) ? Number(node.temperature) : 24.0;
  const smoke = (node.smoke_ppm !== undefined && node.smoke_ppm !== null) ? Number(node.smoke_ppm) : 10.0;

  const sliderPpl = document.getElementById('test-slider-people');
  if (sliderPpl) {
    sliderPpl.value = ppl;
    document.getElementById('test-disp-people').textContent = `${ppl} ppl`;
  }

  const sliderTemp = document.getElementById('test-slider-temp');
  if (sliderTemp) {
    sliderTemp.value = Math.round(temp);
    document.getElementById('test-disp-temp').textContent = `${temp.toFixed(1)} °C`;
  }

  const sliderSmoke = document.getElementById('test-slider-smoke');
  if (sliderSmoke) {
    sliderSmoke.value = Math.round(smoke);
    document.getElementById('test-disp-smoke').textContent = `${Math.round(smoke)} PPM`;
  }

  const btnSubmit = document.getElementById('btn-submit-telemetry');
  if (btnSubmit) {
    btnSubmit.innerHTML = `<i class="fa-solid fa-paper-plane"></i> POST to /node/${node.node_id}/report`;
  }
}

// -------------------------------------------------------------
// Interactive Test Mode Handlers
// -------------------------------------------------------------
window.setTestNodeHazard = function(hz) {
  if (!window.selectedNodeData) return;
  currentTestHazard = hz;

  let temp = 24.0, smoke = 10.0, flame = false, blocked = false;
  if (hz === 'CRITICAL') {
    temp = 75.0;
    smoke = 220.0;
    flame = true;
    blocked = true;
  } else if (hz === 'WARNING') {
    temp = 48.0;
    smoke = 85.0;
    flame = false;
    blocked = false;
  }

  const sliderTemp = document.getElementById('test-slider-temp');
  if (sliderTemp) {
    sliderTemp.value = temp;
    document.getElementById('test-disp-temp').textContent = `${temp.toFixed(1)} °C`;
  }

  const sliderSmoke = document.getElementById('test-slider-smoke');
  if (sliderSmoke) {
    sliderSmoke.value = smoke;
    document.getElementById('test-disp-smoke').textContent = `${smoke} PPM`;
  }

  const blockedToggle = document.getElementById('test-toggle-blocked');
  if (blockedToggle) blockedToggle.checked = blocked;
  currentTestBlocked = blocked;

  const btnHzSafe = document.getElementById('btn-hz-safe');
  const btnHzWarn = document.getElementById('btn-hz-warning');
  const btnHzCrit = document.getElementById('btn-hz-critical');
  if (btnHzSafe) btnHzSafe.classList.toggle('active', hz === 'SAFE');
  if (btnHzWarn) btnHzWarn.classList.toggle('active', hz === 'WARNING');
  if (btnHzCrit) btnHzCrit.classList.toggle('active', hz === 'CRITICAL');

  window.submitTestNodeTelemetry({
    hazard_flag: hz,
    temperature: temp,
    smoke_ppm: smoke,
    flame_detected: flame,
    blocked: blocked
  });
};

window.setTestNodeCongestion = function(cg) {
  if (!window.selectedNodeData) return;
  currentTestCongestion = cg;

  let ppl = 0;
  if (cg === 'HIGH') {
    ppl = 15;
  } else if (cg === 'MEDIUM') {
    ppl = 5;
  } else {
    ppl = 0;
  }

  const sliderPpl = document.getElementById('test-slider-people');
  if (sliderPpl) {
    sliderPpl.value = ppl;
    document.getElementById('test-disp-people').textContent = `${ppl} ppl`;
  }

  const btnCgLow = document.getElementById('btn-cg-low');
  const btnCgMed = document.getElementById('btn-cg-medium');
  const btnCgHigh = document.getElementById('btn-cg-high');
  if (btnCgLow) btnCgLow.classList.toggle('active', cg === 'LOW');
  if (btnCgMed) btnCgMed.classList.toggle('active', cg === 'MEDIUM');
  if (btnCgHigh) btnCgHigh.classList.toggle('active', cg === 'HIGH');

  window.submitTestNodeTelemetry({
    congestion_level: cg,
    people_count: ppl
  });
};

window.toggleTestNodeBlocked = function(isBlocked) {
  currentTestBlocked = isBlocked;
  window.submitTestNodeTelemetry({
    blocked: isBlocked,
    hazard_flag: isBlocked ? 'CRITICAL' : currentTestHazard
  });
};

window.onTestSliderInput = function(type, val) {
  if (type === 'people') {
    document.getElementById('test-disp-people').textContent = `${val} ppl`;
  } else if (type === 'temp') {
    document.getElementById('test-disp-temp').textContent = `${Number(val).toFixed(1)} °C`;
  } else if (type === 'smoke') {
    document.getElementById('test-disp-smoke').textContent = `${val} PPM`;
  }
};

window.onTestSliderChange = function() {
  window.submitTestNodeTelemetry();
};

window.submitTestNodeTelemetry = async function(overrides = {}) {
  if (!window.selectedNodeData) return;
  const nid = window.selectedNodeData.node_id;

  const sliderPpl = document.getElementById('test-slider-people');
  const sliderTemp = document.getElementById('test-slider-temp');
  const sliderSmoke = document.getElementById('test-slider-smoke');
  const blockedToggle = document.getElementById('test-toggle-blocked');

  const ppl = overrides.people_count !== undefined ? overrides.people_count : (sliderPpl ? parseInt(sliderPpl.value, 10) : 0);
  const temp = overrides.temperature !== undefined ? overrides.temperature : (sliderTemp ? parseFloat(sliderTemp.value) : 24.0);
  const smoke = overrides.smoke_ppm !== undefined ? overrides.smoke_ppm : (sliderSmoke ? parseFloat(sliderSmoke.value) : 10.0);
  const blocked = overrides.blocked !== undefined ? overrides.blocked : (blockedToggle ? blockedToggle.checked : false);
  const hz = overrides.hazard_flag || currentTestHazard || 'SAFE';
  const cg = overrides.congestion_level || currentTestCongestion || 'LOW';
  const flame = overrides.flame_detected !== undefined ? overrides.flame_detected : (hz === 'CRITICAL');

  const payload = {
    node_id: nid,
    mode: currentMode,
    hazard_flag: hz,
    congestion_level: cg,
    blocked: blocked,
    people_count: ppl,
    area_ratio: (ppl > 10 ? 0.55 : (ppl > 3 ? 0.25 : 0.0)),
    temperature: temp,
    smoke_ppm: smoke,
    flame_detected: flame
  };

  const feedbackEl = document.getElementById('test-post-feedback');
  if (feedbackEl) {
    feedbackEl.textContent = `Posting to /node/${nid}/report...`;
    feedbackEl.className = 'post-feedback sending';
  }

  try {
    const res = await fetch(`/node/${nid}/report?mode=${currentMode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Immediately update local node caches with fresh server signs and route
    if (window.selectedNodeData && (window.selectedNodeData.node_id === nid || window.selectedNodeData.id === nid)) {
      Object.assign(window.selectedNodeData, data, payload);
      refreshInspectorData(window.selectedNodeData);
    }
    const nodeInAll = (window.allNodes || []).find(n => n.node_id === nid || n.id === nid);
    if (nodeInAll) Object.assign(nodeInAll, data, payload);
    const nodeInGraph = (Graph2DView.nodes || []).find(n => n.node_id === nid || n.id === nid);
    if (nodeInGraph) Object.assign(nodeInGraph, data, payload);

    if (feedbackEl) {
      feedbackEl.textContent = `✓ POST SUCCESS (Exit: ${data.nearest_exit || 'None'}, Next: ${data.next_hop || 'None'} [${data.exit_direction || data.direction_side || 'N/A'}], Signs: A:${data.display_a} B:${data.display_b})`;
      feedbackEl.className = 'post-feedback success';
    }

    logIncident(`[TEST OVERRIDE] ${nid}: Hazard=${payload.hazard_flag}, Congestion=${payload.congestion_level}, Signs=(A:${data.display_a}, B:${data.display_b})`, payload.hazard_flag === 'CRITICAL' ? 'danger' : (payload.hazard_flag === 'WARNING' ? 'warning' : 'info'));

    // Trigger immediate poll so graph canvas and matrix displays update in real-time
    pollStateNow();
  } catch (err) {
    if (feedbackEl) {
      feedbackEl.textContent = `Error: ${err.message}`;
      feedbackEl.className = 'post-feedback error';
    }
  }
};

function closeInspector() {
  document.getElementById('node-inspector').classList.remove('open');
}

function reset2DGraphZoom() {
  Graph2DView.resetView();
}

window.reloadMonitoringScene = async function() {
  const btn = document.getElementById('btn-reload-graph');
  if (btn) {
    btn.classList.add('rotating');
    const icon = btn.querySelector('i');
    if (icon) icon.classList.add('fa-spin');
  }

  try {
    // 1. Reload matrix layout positions & edges from disk
    await loadMatrixEdgesForMonitor(currentMode);

    // 2. Poll fresh state & Dijkstra routes from server (cache-busted)
    await pollStateNow();

    // 3. Re-calculate canvas dimensions & clear/redraw scene
    Graph2DView.resize();
    Graph2DView.draw();

    logIncident("Scene completely reloaded and redrawn from server state.", "info");
  } catch (err) {
    logIncident(`Failed to reload scene: ${err.message}`, "warning");
  } finally {
    setTimeout(() => {
      if (btn) {
        btn.classList.remove('rotating');
        const icon = btn.querySelector('i');
        if (icon) icon.classList.remove('fa-spin');
      }
    }, 400);
  }
};

// Incident logger
function logIncident(msg, type = "info") {
  const ticker = document.getElementById('log-ticker');
  if (!ticker) return;
  const now = new Date().toLocaleTimeString();
  const span = document.createElement('span');
  span.className = `log-entry ${type}`;
  span.textContent = `[${now}] ${msg}  •  `;
  ticker.prepend(span);
}

// Live Clock
function startClock() {
  const clockEl = document.getElementById('live-clock');
  setInterval(() => {
    clockEl.textContent = new Date().toTimeString().split(' ')[0];
  }, 1000);
}

// Web Audio Siren Synth
function triggerAudioSiren() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.6);

    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  } catch (e) {
    // audio policy
  }
}

window.updateCameraIp = function() {
  const ipInput = document.getElementById('cam-ip-input');
  const camStream = document.getElementById('live-cam-stream');
  if (ipInput && camStream) {
    camStream.src = ipInput.value;
  }
};
