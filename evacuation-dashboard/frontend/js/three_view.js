/**
 * three_view.js - Single Floor 3D Building Visualisation (Home View)
 * Three.js 3D Building Layout, Exit Beacons, Dynamic Evacuation Lasers & Fire Particles
 */

const ThreeBuildingView = {
  container: null,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  raycaster: null,
  mouse: null,

  nodeMeshes: new Map(), // node_id -> Group
  exitMeshes: new Map(),
  hazardParticles: [],
  pathLines: [],
  
  isInitialized: false,

  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || (window.innerHeight - 150);

    // 1. Scene Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080c14);
    this.scene.fog = new THREE.FogExp2(0x080c14, 0.007);

    // 2. Camera Setup
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 1000);
    this.camera.position.set(0, 75, 75);

    // 3. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // 4. Orbit Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.05;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 180;
    this.controls.target.set(0, 0, 0);

    // 5. Lighting
    this.setupLighting();

    // 6. Build Single Floor Architecture
    this.buildSingleFloorArchitecture();

    // 7. Raycasting
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // 8. Animation Loop
    this.isInitialized = true;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  },

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x243b5e, 1.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x99ccff, 1.6);
    dirLight.position.set(40, 70, 30);
    this.scene.add(dirLight);

    const cyanGlow = new THREE.PointLight(0x00d8ff, 1.5, 80);
    cyanGlow.position.set(0, 20, 0);
    this.scene.add(cyanGlow);
  },

  buildSingleFloorArchitecture() {
    // Ground Grid
    const gridHelper = new THREE.GridHelper(120, 24, 0x1e3050, 0x0f1828);
    gridHelper.position.y = -0.1;
    this.scene.add(gridHelper);

    // Main Single Floor Slab (90m wide, 70m deep)
    const slabGeo = new THREE.BoxGeometry(94, 0.8, 74);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x111c30,
      roughness: 0.25,
      metalness: 0.75,
      transparent: true,
      opacity: 0.85
    });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.y = 0;
    this.scene.add(slabMesh);

    // Slab glowing perimeter edge
    const edgesGeo = new THREE.EdgesGeometry(slabGeo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x00d8ff, transparent: true, opacity: 0.4 });
    const edgeLines = new THREE.LineSegments(edgesGeo, edgesMat);
    edgeLines.position.y = 0;
    this.scene.add(edgeLines);

    // Architectural Walls & Corridors
    this.buildWalls();

    // 3 Emergency Exit Doorways
    this.buildExitDoors();
  },

  buildWalls() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e2e4a,
      roughness: 0.4,
      metalness: 0.4,
      transparent: true,
      opacity: 0.5
    });

    const wallHeight = 5.5;
    const yCenter = wallHeight / 2 + 0.4;

    const makeWall = (w, d, x, z) => {
      const geo = new THREE.BoxGeometry(w, wallHeight, d);
      const mesh = new THREE.Mesh(geo, wallMat);
      mesh.position.set(x, yCenter, z);
      this.scene.add(mesh);
    };

    // North Corridor partitions
    makeWall(26, 0.8, -15, -28);
    makeWall(26, 0.8, 15, -28);
    makeWall(0.8, 18, -36, -20);
    makeWall(0.8, 18, 36, -20);

    // Central cross hallway partitions
    makeWall(26, 0.8, -18, -10);
    makeWall(26, 0.8, 18, -10);
    makeWall(26, 0.8, -18, 10);
    makeWall(26, 0.8, 18, 10);

    // South Offices & Lobby partitions
    makeWall(26, 0.8, -18, 28);
    makeWall(26, 0.8, 18, 28);
    makeWall(0.8, 18, -36, 18);
    makeWall(0.8, 18, 36, 18);
  },

  buildExitDoors() {
    // 3 Main Exits: West, East, South
    const exitConfigs = [
      { id: "EXIT-WEST", x: -44, y: 3, z: 0, label: "EXIT 1 (WEST)" },
      { id: "EXIT-EAST", x: 44, y: 3, z: 0, label: "EXIT 2 (EAST)" },
      { id: "EXIT-SOUTH", x: 0, y: 3, z: 34, label: "EXIT 3 (SOUTH MAIN)" }
    ];

    exitConfigs.forEach(ex => {
      const group = new THREE.Group();
      group.position.set(ex.x, ex.y, ex.z);

      // Green Glowing Exit Door Portal
      const doorGeo = new THREE.BoxGeometry(ex.z !== 0 ? 8 : 1, 4.5, ex.z !== 0 ? 1 : 8);
      const doorMat = new THREE.MeshStandardMaterial({
        color: 0x00f090,
        emissive: 0x00f090,
        emissiveIntensity: 0.8
      });
      const doorMesh = new THREE.Mesh(doorGeo, doorMat);
      group.add(doorMesh);

      // Light beacon
      const light = new THREE.PointLight(0x00f090, 2, 20);
      group.add(light);

      this.exitMeshes.set(ex.id, group);
      this.scene.add(group);
    });
  },

  // -------------------------------------------------------------
  // UPDATE NODES & DYNAMIC EVACUATION PATHS
  // -------------------------------------------------------------
  updateNodes(nodesData, edgesData) {
    if (!this.isInitialized) return;

    nodesData.forEach(node => {
      let nodeGroup = this.nodeMeshes.get(node.node_id);

      if (!nodeGroup) {
        nodeGroup = this.createNodeMesh(node);
        this.nodeMeshes.set(node.node_id, nodeGroup);
        this.scene.add(nodeGroup);
      }

      this.syncNodeVisuals(nodeGroup, node);
    });

    // Update dynamic evacuation laser lines
    this.updateEvacuationPaths(nodesData, edgesData);
  },

  createNodeMesh(node) {
    const group = new THREE.Group();
    group.userData = { nodeId: node.node_id, data: node };

    // Core Beacon Sphere
    const coreGeo = new THREE.SphereGeometry(1.2, 16, 16);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x00f090,
      emissive: 0x00f090,
      emissiveIntensity: 0.9,
      roughness: 0.2
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.name = "core";
    group.add(coreMesh);

    // Pulsing Radar Ring
    const ringGeo = new THREE.RingGeometry(1.8, 2.4, 24);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00f090,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.name = "ring";
    group.add(ringMesh);

    // Dual Sign Housing
    const signHousingGeo = new THREE.BoxGeometry(4.0, 2.0, 0.8);
    const signHousingMat = new THREE.MeshStandardMaterial({ color: 0x0a101d, metalness: 0.9 });
    const signMesh = new THREE.Mesh(signHousingGeo, signHousingMat);
    signMesh.position.y = 2.6;
    signMesh.name = "sign";
    group.add(signMesh);

    // Sign Display A (Left) & Display B (Right)
    const dispGeo = new THREE.PlaneGeometry(1.5, 1.5);
    const dispMatA = new THREE.MeshBasicMaterial({ color: 0x00f090 });
    const dispMatB = new THREE.MeshBasicMaterial({ color: 0xff3b5c });

    const dispMeshA = new THREE.Mesh(dispGeo, dispMatA);
    dispMeshA.position.set(-0.9, 2.6, 0.42);
    dispMeshA.name = "dispA";
    group.add(dispMeshA);

    const dispMeshB = new THREE.Mesh(dispGeo, dispMatB);
    dispMeshB.position.set(0.9, 2.6, 0.42);
    dispMeshB.name = "dispB";
    group.add(dispMeshB);

    const pos = node.position_3d || { x: 0, y: 3, z: 0 };
    group.position.set(pos.x, pos.y, pos.z);

    return group;
  },

  syncNodeVisuals(group, node) {
    group.userData.data = node;
    const core = group.getObjectByName("core");
    const ring = group.getObjectByName("ring");
    const dispA = group.getObjectByName("dispA");
    const dispB = group.getObjectByName("dispB");

    const isHazard = (node.hazard_flag === 'CRITICAL' || node.hazard_flag === 'FIRE' || node.blocked);
    const statusColor = isHazard ? 0xff3b5c : 0x00f090;

    if (core) {
      core.material.color.setHex(statusColor);
      core.material.emissive.setHex(statusColor);
      core.material.emissiveIntensity = isHazard ? 1.6 : 0.9;
    }
    if (ring) {
      ring.material.color.setHex(statusColor);
    }

    // Displays color
    if (dispA) {
      const isStopA = (node.display_a === 'STOP' || node.display_a === 'BLOCKED');
      dispA.material.color.setHex(isStopA ? 0xff3b5c : 0x00f090);
    }
    if (dispB) {
      const isStopB = (node.display_b === 'STOP' || node.display_b === 'BLOCKED');
      dispB.material.color.setHex(isStopB ? 0xff3b5c : 0x00f090);
    }

    // Attach Fire particles if hazardous
    if (isHazard && !group.userData.fireSystem) {
      group.userData.fireSystem = this.createFireParticles(group.position);
    } else if (!isHazard && group.userData.fireSystem) {
      this.scene.remove(group.userData.fireSystem);
      group.userData.fireSystem = null;
    }
  },

  createFireParticles(pos) {
    const particleCount = 45;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = [];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = pos.x + (Math.random() - 0.5) * 3.5;
      positions[i * 3 + 1] = pos.y + Math.random() * 4;
      positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 3.5;

      colors[i * 3] = 1.0;
      colors[i * 3 + 1] = Math.random() * 0.4;
      colors[i * 3 + 2] = 0.0;

      velocities.push({
        y: 0.12 + Math.random() * 0.18,
        x: (Math.random() - 0.5) * 0.06,
        z: (Math.random() - 0.5) * 0.06
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pMaterial = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    const firePoints = new THREE.Points(geometry, pMaterial);
    firePoints.userData = { velocities, basePos: pos.clone() };
    this.scene.add(firePoints);
    this.hazardParticles.push(firePoints);
    return firePoints;
  },

  updateEvacuationPaths(nodes, edges) {
    // Clear old lines
    this.pathLines.forEach(l => this.scene.remove(l));
    this.pathLines = [];

    if (!edges) return;

    const nodePosMap = new Map();
    nodes.forEach(n => nodePosMap.set(n.node_id, n.position_3d));
    nodePosMap.set("EXIT-WEST", { x: -42, y: 2.5, z: 0 });
    nodePosMap.set("EXIT-EAST", { x: 42, y: 2.5, z: 0 });
    nodePosMap.set("EXIT-SOUTH", { x: 0, y: 2.5, z: 32 });

    edges.forEach(edge => {
      const p1 = nodePosMap.get(edge.from);
      const p2 = nodePosMap.get(edge.to);
      if (!p1 || !p2) return;

      const isBlocked = (edge.status === 'BLOCKED');
      const isActiveRoute = (edge.is_active_route === true || edge.status === 'ACTIVE_ROUTE');

      const points = [
        new THREE.Vector3(p1.x, p1.y + 0.3, p1.z),
        new THREE.Vector3(p2.x, p2.y + 0.3, p2.z)
      ];

      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: isBlocked ? 0xff3b5c : (isActiveRoute ? 0x00f090 : 0x224466),
        linewidth: isActiveRoute ? 4 : 1.5,
        transparent: true,
        opacity: isBlocked ? 0.35 : (isActiveRoute ? 0.95 : 0.3)
      });

      const line = new THREE.Line(lineGeo, lineMat);
      this.scene.add(line);
      this.pathLines.push(line);
    });
  },

  // -------------------------------------------------------------
  // ANIMATION & INTERACTION
  // -------------------------------------------------------------
  animate(timestamp) {
    requestAnimationFrame(this.animate);

    if (this.controls) this.controls.update();

    // Pulse radar rings
    const time = timestamp * 0.003;
    this.nodeMeshes.forEach(group => {
      const ring = group.getObjectByName("ring");
      if (ring) {
        const scale = 1 + Math.sin(time * 2 + group.position.x) * 0.15;
        ring.scale.set(scale, scale, scale);
      }
    });

    // Update Fire particles
    this.hazardParticles.forEach(fp => {
      const positions = fp.geometry.attributes.position.array;
      const vels = fp.userData.velocities;
      const basePos = fp.userData.basePos;

      for (let i = 0; i < vels.length; i++) {
        positions[i * 3 + 1] += vels[i].y;
        positions[i * 3] += vels[i].x;
        positions[i * 3 + 2] += vels[i].z;

        if (positions[i * 3 + 1] > basePos.y + 6) {
          positions[i * 3 + 1] = basePos.y;
          positions[i * 3] = basePos.x + (Math.random() - 0.5) * 2;
          positions[i * 3 + 2] = basePos.z + (Math.random() - 0.5) * 2;
        }
      }
      fp.geometry.attributes.position.needsUpdate = true;
    });

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  },

  onPointerDown(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const checkObjects = [];
    this.nodeMeshes.forEach(group => {
      group.traverse(child => {
        if (child.isMesh) checkObjects.push(child);
      });
    });

    const intersects = this.raycaster.intersectObjects(checkObjects, false);
    if (intersects.length > 0) {
      let topGroup = intersects[0].object;
      while (topGroup.parent && !topGroup.userData.nodeId) {
        topGroup = topGroup.parent;
      }
      if (topGroup.userData.nodeId) {
        window.selectNodeById(topGroup.userData.nodeId);
      }
    }
  },

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  },

  // Camera Presets
  setCameraPreset(type) {
    if (!this.controls || !this.camera) return;

    if (type === 'isometric') {
      this.camera.position.set(0, 75, 75);
      this.controls.target.set(0, 0, 0);
    } else if (type === 'top') {
      this.camera.position.set(0, 95, 0.1);
      this.controls.target.set(0, 0, 0);
    } else if (type === 'front') {
      this.camera.position.set(0, 25, 75);
      this.controls.target.set(0, 0, 0);
    }
    this.controls.update();
  },

  focusHazardNode() {
    let targetNode = null;
    this.nodeMeshes.forEach(group => {
      const data = group.userData.data;
      if (data && (data.hazard_flag === 'CRITICAL' || data.hazard_flag === 'FIRE')) {
        targetNode = group;
      }
    });

    if (targetNode) {
      const pos = targetNode.position;
      this.camera.position.set(pos.x, pos.y + 20, pos.z + 30);
      this.controls.target.set(pos.x, pos.y, pos.z);
      this.controls.update();
      window.selectNodeById(targetNode.userData.nodeId);
    } else {
      window.logIncident("No active fire hazard currently detected.", "info");
    }
  },

  resetCamera() {
    this.setCameraPreset('isometric');
  }
};

window.ThreeBuildingView = ThreeBuildingView;
