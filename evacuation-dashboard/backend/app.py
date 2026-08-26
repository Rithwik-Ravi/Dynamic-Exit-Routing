import os
import json
import time
import math
import heapq
import copy
from flask import Flask, request, jsonify, send_from_directory

# Configure paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

def get_graph_file_paths(mode):
    safe_mode = "test" if mode == "test" else "live"
    return (
        os.path.join(DATA_DIR, f"graph_matrix_{safe_mode}.json"),
        os.path.join(DATA_DIR, f"graph_matrix_{safe_mode}.txt")
    )

app = Flask(
    __name__,
    static_folder=FRONTEND_DIR,
    static_url_path=""
)

# ==============================================================================
# 1. LIVE HARDWARE NODE DICTIONARY
# ==============================================================================

nodes = {
    "node4": {
        "node_id": "NODE-4",
        "floor": 1,
        "location": "East Server Room (Elevated Heat Warning)",
        "is_physical": False,
        "active": True,
        "blocked": False,
        "hazard_flag": "WARNING",
        "people_count": 1,
        "area_ratio": 0.0600,
        "flow": 0,
        "temperature": 49.5,
        "smoke_ppm": 85.0,
        "flame_detected": False,
        "position_2d": {"x": 240, "y": -140}
        },
    }

# ==============================================================================
# 2. NESTED TEST NODE DICTIONARY
# ==============================================================================

test_nodes = {
    "NODE-1": {
        "node_id": "NODE-1",
        "floor": 1,
        "location": "West Corridor (Near Exit 1)",
        "is_physical": True,
        "active": True,
        "blocked": False,
        "hazard_flag": "SAFE",
        "people_count": 2,
        "area_ratio": 0.1200,
        "flow": 0,
        "temperature": 23.5,
        "smoke_ppm": 10.0,
        "flame_detected": False,
        "position_2d": {"x": -240, "y": 0}
    },
    "NODE-2": {
        "node_id": "NODE-2",
        "floor": 1,
        "location": "Northwest Research Lab",
        "is_physical": False,
        "active": True,
        "blocked": False,
        "hazard_flag": "SAFE",
        "people_count": 4,
        "area_ratio": 0.2200,
        "flow": 1,
        "temperature": 24.0,
        "smoke_ppm": 12.0,
        "flame_detected": False,
        "position_2d": {"x": -240, "y": -140}
    },
    "NODE-3": {
        "node_id": "NODE-3",
        "floor": 1,
        "location": "North Corridor (High Crowd Congestion)",
        "is_physical": False,
        "active": True,
        "blocked": False,
        "hazard_flag": "SAFE",
        "people_count": 9,
        "area_ratio": 0.5200,
        "flow": 4,
        "temperature": 25.8,
        "smoke_ppm": 16.0,
        "flame_detected": False,
        "position_2d": {"x": 0, "y": -140}
    },
    "NODE-4": {
        "node_id": "NODE-4",
        "floor": 1,
        "location": "East Server Room (Elevated Heat Warning)",
        "is_physical": False,
        "active": True,
        "blocked": False,
        "hazard_flag": "WARNING",
        "people_count": 1,
        "area_ratio": 0.0600,
        "flow": 0,
        "temperature": 49.5,
        "smoke_ppm": 85.0,
        "flame_detected": False,
        "position_2d": {"x": 240, "y": -140}
    },
    "NODE-5": {
        "node_id": "NODE-5",
        "floor": 1,
        "location": "East Wing Corridor (FIRE HAZARD & BLOCKED)",
        "is_physical": False,
        "active": True,
        "blocked": True,
        "hazard_flag": "CRITICAL",
        "people_count": 0,
        "area_ratio": 0.0000,
        "flow": -2,
        "temperature": 84.0,
        "smoke_ppm": 310.0,
        "flame_detected": True,
        "position_2d": {"x": 240, "y": 0}
    },
    "NODE-6": {
        "node_id": "NODE-6",
        "floor": 1,
        "location": "Central Atrium Intersection",
        "is_physical": False,
        "active": True,
        "blocked": False,
        "hazard_flag": "SAFE",
        "people_count": 5,
        "area_ratio": 0.2800,
        "flow": 2,
        "temperature": 24.2,
        "smoke_ppm": 14.0,
        "flame_detected": False,
        "position_2d": {"x": 0, "y": 0}
    },
    "NODE-7": {
        "node_id": "NODE-7",
        "floor": 1,
        "location": "Southwest Office Hallway",
        "is_physical": False,
        "active": True,
        "blocked": False,
        "hazard_flag": "SAFE",
        "people_count": 2,
        "area_ratio": 0.1100,
        "flow": 0,
        "temperature": 23.8,
        "smoke_ppm": 9.0,
        "flame_detected": False,
        "position_2d": {"x": -180, "y": 130}
    },
    "NODE-8": {
        "node_id": "NODE-8",
        "floor": 1,
        "location": "Southeast Conference Corridor",
        "is_physical": False,
        "active": True,
        "blocked": False,
        "hazard_flag": "SAFE",
        "people_count": 3,
        "area_ratio": 0.1700,
        "flow": 1,
        "temperature": 24.4,
        "smoke_ppm": 11.0,
        "flame_detected": False,
        "position_2d": {"x": 180, "y": 130}
    },
    "NODE-9": {
        "node_id": "NODE-9",
        "floor": 1,
        "location": "South Main Lobby & Exit 3",
        "is_physical": False,
        "active": True,
        "blocked": False,
        "hazard_flag": "SAFE",
        "people_count": 3,
        "area_ratio": 0.1900,
        "flow": 1,
        "temperature": 24.0,
        "smoke_ppm": 12.0,
        "flame_detected": False,
        "position_2d": {"x": 0, "y": 150}
    }
}

# ==============================================================================
# FRONTEND STATIC ROUTES
# ==============================================================================

@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")

@app.route("/<path:path>")
def static_proxy(path):
    file_path = os.path.join(FRONTEND_DIR, path)
    if os.path.exists(file_path):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")

# ==============================================================================
# POST /node/<node_id>/report (Hardware updates live 'nodes' dict)
# ==============================================================================

# ==============================================================================
# ROUTING & HYBRID COST MATRIX ENGINE (DIJKSTRA MULTI-EXIT EVACUATION)
# ==============================================================================

def compute_node_hazard_and_congestion(node):
    if not node:
        return "SAFE", "LOW"

    blocked = bool(node.get("blocked", False))
    h_flag = str(node.get("hazard_flag", "SAFE")).strip().upper()
    temp = float(node.get("temperature") or 0.0)
    smoke = float(node.get("smoke_ppm") or 0.0)
    flame = bool(node.get("flame_detected", False))

    if h_flag in ["CRITICAL", "FIRE", "DANGER"] or flame or temp > 65.0 or smoke > 200.0 or (blocked and h_flag not in ["SAFE", "NONE", "CLEAR", "NORMAL"]):
        hazard_status = "CRITICAL"
    elif h_flag in ["WARNING", "WARN"] or temp > 45.0 or smoke > 80.0:
        hazard_status = "WARNING"
    else:
        hazard_status = "SAFE"

    ppl = int(node.get("people_count", 0) or 0)
    area = float(node.get("area_ratio") or 0.0)
    c_level = str(node.get("congestion_level", "LOW")).strip().upper()

    if c_level in ["HIGH", "HEAVY", "CONGESTED"] or area > 0.4 or ppl > 6:
        congestion_status = "HIGH"
    elif c_level in ["MODERATE", "MEDIUM", "MED"] or area > 0.2 or ppl > 3:
        congestion_status = "MEDIUM"
    else:
        congestion_status = "LOW"

    return hazard_status, congestion_status


def get_node_state_signature(node):
    if not node:
        return "SAFE|LOW|False"
    hz, cg = compute_node_hazard_and_congestion(node)
    blk = bool(node.get("blocked", False))
    return f"{hz}|{cg}|{blk}"


def get_hybrid_cost_matrix(mode):
    safe_mode = "test" if mode == "test" else "live"
    file_json, _ = get_graph_file_paths(safe_mode)
    target_dict = test_nodes if safe_mode == "test" else nodes

    if not os.path.exists(file_json):
        return {
            "exists": False,
            "base_matrix": [],
            "effective_matrix": [],
            "nodes": [],
            "edges": []
        }

    try:
        with open(file_json, "r") as f:
            data = json.load(f)

        raw_nodes = data.get("nodes", [])
        raw_positions = data.get("node_positions", {})
        raw_edges = data.get("edges", [])
        base_matrix = data.get("matrix", [])

        node_ids = []
        for n in raw_nodes:
            nid = n.get("id") or n.get("node_id") if isinstance(n, dict) else str(n)
            if nid and nid not in node_ids:
                node_ids.append(nid)

        N = len(node_ids)
        node_index = {nid: i for i, nid in enumerate(node_ids)}

        effective_matrix = [[-1.0 if i != j else 0.0 for j in range(N)] for i in range(N)]
        effective_edges = []

        for e in raw_edges:
            u = str(e.get("from"))
            v = str(e.get("to"))
            if u in node_index and v in node_index:
                i = node_index[u]
                j = node_index[v]

                base_dist = float(e.get("base_distance") or e.get("distance") or -1.0)
                if base_dist < 0 and i < len(base_matrix) and j < len(base_matrix[i]):
                    base_dist = float(base_matrix[i][j])

                if base_dist == -1.0 or i == j:
                    eff_w = base_dist
                    multiplier_reason = "BASE_DISCONNECTED" if base_dist == -1.0 else "SELF"
                else:
                    node_u = target_dict.get(u, {})
                    node_v = target_dict.get(v, {})

                    hz_u, cg_u = compute_node_hazard_and_congestion(node_u)
                    hz_v, cg_v = compute_node_hazard_and_congestion(node_v)

                    # 1. Critical Hazard Check: weight = -1 (disconnected)
                    if hz_u == "CRITICAL" or hz_v == "CRITICAL":
                        eff_w = -1.0
                        multiplier_reason = "HAZARD_CRITICAL"
                    # 2. Warning Hazard Check: weight * 5 (ignores congestion)
                    elif hz_u == "WARNING" or hz_v == "WARNING":
                        eff_w = round(base_dist * 5.0, 2)
                        multiplier_reason = "HAZARD_WARNING (x5)"
                    # 3. Congestion Multiplier Check (only if no Critical/Warning hazard)
                    else:
                        if cg_u == "HIGH" or cg_v == "HIGH":
                            multiplier = 2.0
                            multiplier_reason = "CONGESTION_HIGH (x2)"
                        elif cg_u == "MEDIUM" or cg_v == "MEDIUM":
                            multiplier = 1.5
                            multiplier_reason = "CONGESTION_MEDIUM (x1.5)"
                        else:
                            multiplier = 1.0
                            multiplier_reason = "CLEAR (x1.0)"
                        eff_w = round(base_dist * multiplier, 2)

                effective_matrix[i][j] = eff_w
                effective_matrix[j][i] = eff_w

                effective_edges.append({
                    "from": u,
                    "to": v,
                    "from_display": e.get("from_display", "Front"),
                    "to_display": e.get("to_display", "Front"),
                    "base_distance": base_dist,
                    "distance": eff_w,
                    "effective_weight": eff_w,
                    "reason": multiplier_reason
                })

        main_entrance_id = data.get("main_entrance_id") or data.get("main_exit_id", None)

        return {
            "exists": True,
            "mode": safe_mode,
            "node_count": N,
            "nodes": raw_nodes,
            "node_ids": node_ids,
            "node_positions": raw_positions,
            "base_matrix": base_matrix,
            "effective_matrix": effective_matrix,
            "edges": effective_edges,
            "main_entrance_id": main_entrance_id
        }
    except Exception as err:
        return {
            "error": str(err),
            "base_matrix": [],
            "effective_matrix": []
        }


def calculate_dijkstra_evacuation_routes(mode="live"):
    """
    Computes shortest evacuation routes from every node to every single exit
    using Dijkstra's algorithm over dynamic effective weights.
    Selects the nearest exit for each node and sets directional display guidance.
    """
    hybrid = get_hybrid_cost_matrix(mode)
    if not hybrid.get("exists", False):
        return {
            "mode": mode,
            "routes_by_node": {},
            "exits": [],
            "timestamp": time.time(),
            "base_matrix": [],
            "effective_matrix": []
        }

    node_ids = hybrid.get("node_ids", [])
    raw_nodes = hybrid.get("nodes", [])
    effective_edges = hybrid.get("edges", [])
    target_dict = test_nodes if mode == "test" else nodes

    # Identify Exits and Junctions
    exit_ids = []
    junction_ids = []
    for n in raw_nodes:
        nid = n.get("id") or n.get("node_id") if isinstance(n, dict) else str(n)
        ntype = n.get("node_type", "") if isinstance(n, dict) else ""
        if ntype == "exit" or (isinstance(nid, str) and nid.startswith("EXIT")):
            if nid not in exit_ids:
                exit_ids.append(nid)
        elif ntype == "junction" or (isinstance(nid, str) and nid.startswith("JUNC")):
            if nid not in junction_ids:
                junction_ids.append(nid)

    # Build Adjacency List for Passable Edges (weight >= 0)
    adj = {nid: [] for nid in node_ids}
    edge_map = {}

    for e in effective_edges:
        u = str(e.get("from"))
        v = str(e.get("to"))
        w = float(e.get("distance", -1.0))

        edge_map[(u, v)] = e
        edge_map[(v, u)] = e

        if w >= 0.0:
            adj[u].append((v, w, e))
            adj[v].append((u, w, e))

    def dijkstra_from(source):
        dist = {nid: float("inf") for nid in node_ids}
        prev = {nid: None for nid in node_ids}
        dist[source] = 0.0

        pq = [(0.0, source)]
        while pq:
            curr_dist, u = heapq.heappop(pq)
            if curr_dist > dist[u]:
                continue

            for v, weight, edge_info in adj.get(u, []):
                new_dist = round(curr_dist + weight, 2)
                if new_dist < dist[v]:
                    dist[v] = new_dist
                    prev[v] = u
                    heapq.heappush(pq, (new_dist, v))

        return dist, prev

    def reconstruct_path(prev_map, source, target):
        if source == target:
            return [source]
        if prev_map[target] is None:
            return []
        path = []
        curr = target
        while curr is not None:
            path.append(curr)
            if curr == source:
                break
            curr = prev_map[curr]
        path.reverse()
        return path if (path and path[0] == source) else []

    routes_by_node = {}

    for nid in node_ids:
        is_exit = nid in exit_ids
        is_junc = nid in junction_ids
        node_data = target_dict.get(nid, {})
        hazard_status, _ = compute_node_hazard_and_congestion(node_data)
        is_critical = (hazard_status == "CRITICAL" or node_data.get("blocked", False))

        if is_exit:
            routes_by_node[nid] = {
                "node_id": nid,
                "is_exit": True,
                "is_junction": False,
                "nearest_exit": nid,
                "nearest_exit_distance": 0.0,
                "nearest_exit_path": [nid],
                "next_hop": None,
                "exit_direction": None,
                "direction_side": None,
                "display_a": "FORWARD",
                "display_b": "FORWARD",
                "all_exits": {
                    e_id: {"distance": (0.0 if e_id == nid else float("inf")), "path": ([nid] if e_id == nid else []), "reachable": (e_id == nid)}
                    for e_id in exit_ids
                }
            }
            continue

        if is_critical:
            routes_by_node[nid] = {
                "node_id": nid,
                "is_exit": False,
                "is_junction": is_junc,
                "nearest_exit": None,
                "nearest_exit_distance": -1.0,
                "nearest_exit_path": [],
                "next_hop": None,
                "exit_direction": None,
                "direction_side": None,
                "display_a": "STOP",
                "display_b": "STOP",
                "all_exits": {
                    e_id: {"distance": -1.0, "path": [], "reachable": False}
                    for e_id in exit_ids
                }
            }
            if nid in target_dict:
                target_dict[nid]["display_a"] = "STOP"
                target_dict[nid]["display_b"] = "STOP"
            continue

        # Run Dijkstra from nid
        dist_map, prev_map = dijkstra_from(nid)

        all_exits_info = {}
        reachable_exits = []

        for e_id in exit_ids:
            d = dist_map.get(e_id, float("inf"))
            if d < float("inf"):
                path_to_exit = reconstruct_path(prev_map, nid, e_id)
                all_exits_info[e_id] = {
                    "exit_id": e_id,
                    "distance": d,
                    "path": path_to_exit,
                    "reachable": True
                }
                reachable_exits.append((d, e_id, path_to_exit))
            else:
                all_exits_info[e_id] = {
                    "exit_id": e_id,
                    "distance": -1.0,
                    "path": [],
                    "reachable": False
                }

        if reachable_exits:
            # Sort by lowest distance to pick nearest exit
            reachable_exits.sort(key=lambda x: x[0])
            best_dist, best_exit, best_path = reachable_exits[0]
            next_hop = best_path[1] if len(best_path) > 1 else None

            # Determine exit direction side (Front vs Back)
            exit_direction = None
            display_a = "FORWARD"
            display_b = "STOP"

            if next_hop:
                edge_info = edge_map.get((nid, next_hop))
                if edge_info:
                    if edge_info.get("from") == nid:
                        exit_direction = edge_info.get("from_display", "Front")
                    else:
                        exit_direction = edge_info.get("to_display", "Front")

                # Direction logic per user specification:
                # If next node is on Front: display_a = STOP, display_b = FORWARD
                # If next node is at Back:  display_b = STOP, display_a = FORWARD
                if exit_direction in ["Front", "A"]:
                    display_a = "STOP"
                    display_b = "FORWARD"
                elif exit_direction in ["Back", "B"]:
                    display_a = "FORWARD"
                    display_b = "STOP"

            routes_by_node[nid] = {
                "node_id": nid,
                "is_exit": False,
                "is_junction": is_junc,
                "nearest_exit": best_exit,
                "nearest_exit_distance": best_dist,
                "nearest_exit_path": best_path,
                "next_hop": next_hop,
                "exit_direction": exit_direction,
                "direction_side": exit_direction,
                "display_a": display_a,
                "display_b": display_b,
                "all_exits": all_exits_info
            }

            # Update live/test dictionary node displays
            if nid in target_dict:
                target_dict[nid]["display_a"] = display_a
                target_dict[nid]["display_b"] = display_b
                target_dict[nid]["next_hop"] = next_hop
                target_dict[nid]["exit_direction"] = exit_direction
                target_dict[nid]["direction_side"] = exit_direction
        else:
            routes_by_node[nid] = {
                "node_id": nid,
                "is_exit": False,
                "is_junction": is_junc,
                "nearest_exit": None,
                "nearest_exit_distance": -1.0,
                "nearest_exit_path": [],
                "next_hop": None,
                "exit_direction": None,
                "direction_side": None,
                "display_a": "STOP",
                "display_b": "STOP",
                "all_exits": all_exits_info
            }
            if nid in target_dict:
                target_dict[nid]["display_a"] = "STOP"
                target_dict[nid]["display_b"] = "STOP"

    return {
        "mode": mode,
        "routes_by_node": routes_by_node,
        "exits": exit_ids,
        "junctions": junction_ids,
        "base_matrix": hybrid.get("base_matrix", []),
        "effective_matrix": hybrid.get("effective_matrix", []),
        "effective_edges": hybrid.get("edges", []),
        "timestamp": time.time()
    }


# ==============================================================================
# POST /node/<node_id>/report (Hardware telemetry update & Dijkstra trigger)
# ==============================================================================

@app.route("/node/<node_id>/report", methods=["POST"])
def report_node(node_id):
    data = request.get_json()

    if data is None:
        return jsonify({"error": "Invalid JSON"}), 400

    # Auto-resolve mode (query param, payload, or target dictionary presence)
    mode_param = request.args.get("mode")
    if mode_param:
        mode = mode_param
    elif data.get("mode"):
        mode = data.get("mode")
    elif node_id in test_nodes and node_id not in nodes:
        mode = "test"
    else:
        mode = "live"

    target_dict = test_nodes if mode == "test" else nodes

    node_entry = target_dict.get(node_id, {})
    prev_sig = get_node_state_signature(node_entry)

    # Use node_id from URL or payload
    nid = node_id or data.get("node_id") or data.get("node_id")
    node_entry["node_id"] = nid
    node_entry["active"] = data.get("active", node_entry.get("active", True))

    # Parse incoming hazard flag
    raw_hazard = data.get("hazard_flag") or data.get("hazard") or data.get("hazard_status")
    if raw_hazard is not None:
        h_upper = str(raw_hazard).strip().upper()
        if h_upper in ["NONE", "SAFE", "CLEAR", "NORMAL", "LOW", "0", "FALSE"]:
            node_entry["hazard_flag"] = "SAFE"
            if "blocked" not in data:
                node_entry["blocked"] = False
            if "flame_detected" not in data:
                node_entry["flame_detected"] = False
            if "temperature" not in data and float(node_entry.get("temperature", 24.0) or 24.0) > 45.0:
                node_entry["temperature"] = 24.0
            if "smoke_ppm" not in data and float(node_entry.get("smoke_ppm", 10.0) or 10.0) > 80.0:
                node_entry["smoke_ppm"] = 10.0
        elif h_upper in ["WARNING", "WARN", "1"]:
            node_entry["hazard_flag"] = "WARNING"
            if "blocked" not in data:
                node_entry["blocked"] = False
            if "flame_detected" not in data:
                node_entry["flame_detected"] = False
        elif h_upper in ["CRITICAL", "FIRE", "DANGER", "HIGH", "2"]:
            node_entry["hazard_flag"] = "CRITICAL"
            if "blocked" not in data:
                node_entry["blocked"] = True
            if "flame_detected" not in data:
                node_entry["flame_detected"] = True
        else:
            node_entry["hazard_flag"] = h_upper
    else:
        node_entry["hazard_flag"] = node_entry.get("hazard_flag", "SAFE")

    # Explicit blocked override
    if "blocked" in data:
        node_entry["blocked"] = bool(data["blocked"])

    # 5. crowd_count / people_count
    if "crowd_count" in data or "people_count" in data:
        count = int(data.get("crowd_count") if "crowd_count" in data else data.get("people_count", 0))
        node_entry["crowd_count"] = count
        node_entry["people_count"] = count
        if "area_ratio" not in data:
            node_entry["area_ratio"] = 0.55 if count > 8 else (0.25 if count > 3 else 0.05)

    # 6. congestion_level (LOW | MEDIUM | HIGH)
    raw_congestion = data.get("congestion_level") or data.get("congestion") or data.get("congestion_status")
    if raw_congestion is not None:
        c_upper = str(raw_congestion).strip().upper()
        if c_upper in ["LOW", "NONE", "CLEAR", "NORMAL", "SAFE", "0"]:
            node_entry["congestion_level"] = "LOW"
        elif c_upper in ["MEDIUM", "MODERATE", "MED", "1"]:
            node_entry["congestion_level"] = "MEDIUM"
        elif c_upper in ["HIGH", "HEAVY", "CONGESTED", "2"]:
            node_entry["congestion_level"] = "HIGH"
        else:
            node_entry["congestion_level"] = c_upper
    else:
        node_entry["congestion_level"] = node_entry.get("congestion_level", "LOW")

    node_entry["is_physical"] = data.get("is_physical", node_entry.get("is_physical", (mode == "live")))

    if "flow" in data:
        node_entry["flow"] = int(data["flow"])
    if "temperature" in data:
        node_entry["temperature"] = float(data["temperature"])
    if "smoke_ppm" in data:
        node_entry["smoke_ppm"] = float(data["smoke_ppm"])
    if "flame_detected" in data:
        node_entry["flame_detected"] = bool(data["flame_detected"])
    if "position_2d" in data:
        node_entry["position_2d"] = data["position_2d"]
    if "location" in data:
        node_entry["location"] = data["location"]

    target_dict[nid] = node_entry
    new_sig = get_node_state_signature(target_dict[nid])
    state_changed = (prev_sig != new_sig)

    hz, cg = compute_node_hazard_and_congestion(target_dict[nid])
    target_dict[nid]["hazard_flag"] = hz
    target_dict[nid]["congestion_level"] = cg
    target_dict[nid]["blocked"] = (hz == "CRITICAL" or bool(node_entry.get("blocked", False)))

    # Compute dynamic hybrid cost matrix and run Dijkstra's algorithm
    routing_res = calculate_dijkstra_evacuation_routes(mode)
    node_route = routing_res.get("routes_by_node", {}).get(nid, {})

    display_a = node_route.get("display_a", "STOP" if hz == "CRITICAL" else "FORWARD")
    display_b = node_route.get("display_b", "STOP" if hz == "CRITICAL" else "FORWARD")
    next_hop = node_route.get("next_hop")
    exit_direction = node_route.get("exit_direction", node_route.get("direction_side"))
    nearest_exit = node_route.get("nearest_exit")
    nearest_exit_distance = node_route.get("nearest_exit_distance")
    nearest_exit_path = node_route.get("nearest_exit_path", [])

    # The node must also have display_a, display_b, next_hop, exit_direction stored in its dict
    target_dict[nid]["display_a"] = display_a
    target_dict[nid]["display_b"] = display_b
    target_dict[nid]["next_hop"] = next_hop
    target_dict[nid]["exit_direction"] = exit_direction
    target_dict[nid]["direction_side"] = exit_direction
    target_dict[nid]["nearest_exit"] = nearest_exit
    target_dict[nid]["nearest_exit_distance"] = nearest_exit_distance
    target_dict[nid]["nearest_exit_path"] = nearest_exit_path

    return jsonify({
        "status": "received",
        "node_id": nid,
        "mode": mode,
        "state_changed": state_changed,
        "active": target_dict[nid].get("active", True),
        "blocked": target_dict[nid]["blocked"],
        "hazard_status": hz,
        "hazard_flag": hz,
        "congestion_status": cg,
        "congestion_level": cg,
        "crowd_count": target_dict[nid].get("crowd_count", target_dict[nid].get("people_count", 0)),
        "people_count": target_dict[nid].get("people_count", 0),
        "display_a": display_a,
        "display_b": display_b,
        "next_hop": next_hop,
        "exit_direction": exit_direction,
        "direction_side": exit_direction,
        "nearest_exit": nearest_exit,
        "nearest_exit_distance": nearest_exit_distance,
        "nearest_exit_path": nearest_exit_path,
        "all_exits": node_route.get("all_exits", {})
    })


# ==============================================================================
# GET /node/<node_id>/status
# ==============================================================================

@app.route("/node/<node_id>/status", methods=["GET"])
def node_status(node_id):
    mode = request.args.get("mode", "live")
    target_dict = test_nodes if mode == "test" else nodes

    if node_id not in target_dict:
        return jsonify({
            "error": "Node not found"
        }), 404

    node = target_dict[node_id]
    routing_res = calculate_dijkstra_evacuation_routes(mode)
    node_route = routing_res.get("routes_by_node", {}).get(node_id, {})
    hz, cg = compute_node_hazard_and_congestion(node)

    display_a = node_route.get("display_a", node.get("display_a", "STOP" if hz == "CRITICAL" else "FORWARD"))
    display_b = node_route.get("display_b", node.get("display_b", "STOP" if hz == "CRITICAL" else "FORWARD"))
    next_hop = node_route.get("next_hop", node.get("next_hop"))
    exit_direction = node_route.get("exit_direction", node.get("exit_direction", node_route.get("direction_side", node.get("direction_side"))))
    nearest_exit = node_route.get("nearest_exit", node.get("nearest_exit"))
    nearest_exit_distance = node_route.get("nearest_exit_distance", node.get("nearest_exit_distance"))
    nearest_exit_path = node_route.get("nearest_exit_path", node.get("nearest_exit_path", []))

    # Persist display_a, display_b, next_hop in node dictionary
    node["display_a"] = display_a
    node["display_b"] = display_b
    node["next_hop"] = next_hop
    node["exit_direction"] = exit_direction
    node["direction_side"] = exit_direction
    node["nearest_exit"] = nearest_exit
    node["nearest_exit_distance"] = nearest_exit_distance
    node["nearest_exit_path"] = nearest_exit_path
    node["hazard_flag"] = hz
    node["congestion_level"] = cg

    return jsonify({
        "node_id": node_id,
        "mode": mode,
        "hazard_flag": hz,
        "congestion_level": cg,
        "blocked": bool(node.get("blocked", False)) or (hz == "CRITICAL"),
        "crowd_count": int(node.get("crowd_count", node.get("people_count", 0)) or 0),
        "people_count": int(node.get("people_count", 0) or 0),
        "area_ratio": float(node.get("area_ratio", 0.0) or 0.0),
        "temperature": float(node.get("temperature", 24.0) or 24.0),
        "smoke_ppm": float(node.get("smoke_ppm", 10.0) or 10.0),
        "flame_detected": bool(node.get("flame_detected", False)),
        "display_a": display_a,
        "display_b": display_b,
        "nearest_exit": nearest_exit,
        "nearest_exit_distance": nearest_exit_distance,
        "nearest_exit_path": nearest_exit_path,
        "next_hop": next_hop,
        "exit_direction": exit_direction,
        "direction_side": exit_direction,
        "all_exits": node_route.get("all_exits", {})
    })


# ==============================================================================
# GET /api/routing (Dijkstra Shortest Paths to All Exits)
# ==============================================================================

@app.route("/api/routing", methods=["GET"])
def get_routing():
    mode = request.args.get("mode", "live")
    routes_res = calculate_dijkstra_evacuation_routes(mode)
    return jsonify(routes_res)


# ==============================================================================
# GET /state (Supports mode=test query param, includes dynamic routing)
# ==============================================================================

def compute_dict_signature(mode="live"):
    target_dict = test_nodes if mode == "test" else nodes
    try:
        import hashlib
        raw = json.dumps(target_dict, sort_keys=True, default=str)
        return hashlib.md5(raw.encode("utf-8")).hexdigest()
    except Exception:
        return str(len(target_dict))

@app.route("/state", methods=["GET"])
def get_state():
    mode = request.args.get("mode", "live")
    safe_mode = "test" if mode == "test" else "live"
    target_dict = test_nodes if safe_mode == "test" else nodes
    hybrid_res = get_hybrid_cost_matrix(safe_mode)
    node_positions = hybrid_res.get("node_positions", {})
    routing_res = calculate_dijkstra_evacuation_routes(safe_mode)
    routes_by_node = routing_res.get("routes_by_node", {})

    layout_nodes = hybrid_res.get("nodes", [])
    layout_node_ids = [n.get("id") or n.get("node_id") if isinstance(n, dict) else str(n) for n in layout_nodes]

    # Combine layout nodes and target_dict nodes preserving unique order
    all_nids = []
    for nid in layout_node_ids:
        if nid and nid not in all_nids:
            all_nids.append(nid)
    for nid in target_dict.keys():
        if nid and nid not in all_nids:
            all_nids.append(nid)

    state = []

    for node_id in all_nids:
        node = target_dict.get(node_id, {})
        node_route = routes_by_node.get(node_id, {})
        hz, cg = compute_node_hazard_and_congestion(node)

        display_a = node_route.get("display_a", node.get("display_a", "STOP" if hz == "CRITICAL" else "FORWARD"))
        display_b = node_route.get("display_b", node.get("display_b", "STOP" if hz == "CRITICAL" else "FORWARD"))
        next_hop = node_route.get("next_hop", node.get("next_hop"))
        exit_direction = node_route.get("exit_direction", node.get("exit_direction", node_route.get("direction_side", node.get("direction_side"))))
        nearest_exit = node_route.get("nearest_exit", node.get("nearest_exit"))
        nearest_exit_distance = node_route.get("nearest_exit_distance", node.get("nearest_exit_distance"))
        nearest_exit_path = node_route.get("nearest_exit_path", node.get("nearest_exit_path", []))

        # Store in target dictionary
        if node_id in target_dict:
            target_dict[node_id]["display_a"] = display_a
            target_dict[node_id]["display_b"] = display_b
            target_dict[node_id]["next_hop"] = next_hop
            target_dict[node_id]["exit_direction"] = exit_direction
            target_dict[node_id]["direction_side"] = exit_direction
            target_dict[node_id]["nearest_exit"] = nearest_exit
            target_dict[node_id]["nearest_exit_distance"] = nearest_exit_distance
            target_dict[node_id]["nearest_exit_path"] = nearest_exit_path
            target_dict[node_id]["hazard_flag"] = hz
            target_dict[node_id]["congestion_level"] = cg

        ppl = int(node.get("people_count", node.get("crowd_count", 0)) or 0)
        area = float(node.get("area_ratio", 0.0) or 0.0)

        # Prioritize saved layout matrix position if available
        pos = node_positions.get(node_id) or node.get("position_2d", {"x": 0, "y": 0})

        state.append({
            "node_id": node_id,
            "is_physical": node.get("is_physical", (safe_mode == "live")),
            "active": node.get("active", True),
            "blocked": node.get("blocked", False),
            "hazard_flag": hz,
            "display_a": display_a,
            "display_b": display_b,
            "crowd_count": int(node.get("crowd_count", ppl) or 0),
            "people_count": ppl,
            "area_ratio": area,
            "flow": node.get("flow", 0),
            "temperature": node.get("temperature", 24.0),
            "smoke_ppm": node.get("smoke_ppm", 10.0),
            "flame_detected": node.get("flame_detected", False),
            "congestion_level": cg,
            "location": node.get("location", f"Node {node_id}"),
            "position_2d": pos,
            "nearest_exit": nearest_exit,
            "nearest_exit_distance": nearest_exit_distance,
            "nearest_exit_path": nearest_exit_path,
            "next_hop": next_hop,
            "exit_direction": exit_direction,
            "direction_side": exit_direction,
            "all_exits": node_route.get("all_exits", {})
        })

    return jsonify({
        "mode": safe_mode,
        "dict_signature": compute_dict_signature(safe_mode),
        "dict_node_count": len(target_dict),
        "nodes": state,
        "base_matrix": hybrid_res.get("base_matrix", []),
        "effective_matrix": hybrid_res.get("effective_matrix", []),
        "edges": hybrid_res.get("edges", []),
        "exits": routing_res.get("exits", []),
        "junctions": routing_res.get("junctions", []),
        "main_entrance_id": hybrid_res.get("main_entrance_id", None),
        "routing": routing_res
    })

# ==============================================================================
# GRAPH LAYOUT & 2D ADJACENCY MATRIX SYNC API
# ==============================================================================

@app.route("/api/graph/load", methods=["GET"])
def load_graph():
    mode = request.args.get("mode", "live")
    safe_mode = "test" if mode == "test" else "live"
    file_json, _ = get_graph_file_paths(safe_mode)

    target_dict = test_nodes if safe_mode == "test" else nodes
    all_dict_node_ids = list(target_dict.keys())
    hybrid_res = get_hybrid_cost_matrix(safe_mode)

    # 1. Check if an existing 2D matrix file exists on disk
    if os.path.exists(file_json):
        try:
            with open(file_json, "r") as f:
                data = json.load(f)

            configured_nodes = data.get("nodes", [])
            node_positions = data.get("node_positions", {})
            edges = data.get("edges", [])
            matrix = data.get("matrix", [])

            configured_node_ids = [n["id"] if isinstance(n, dict) else n for n in configured_nodes]

            # Compute unconfigured nodes from the dictionary
            unconfigured = [
                {
                    "node_id": nid,
                    "location": target_dict[nid].get("location", f"Node {nid}"),
                    "hazard_flag": target_dict[nid].get("hazard_flag", "SAFE"),
                    "blocked": target_dict[nid].get("blocked", False)
                }
                for nid in all_dict_node_ids if nid not in configured_node_ids
            ]

            main_ent = data.get("main_entrance_id") or data.get("main_exit_id") or hybrid_res.get("main_entrance_id")

            return jsonify({
                "exists": len(configured_nodes) > 0,
                "mode": safe_mode,
                "nodes": configured_nodes,
                "node_positions": node_positions,
                "edges": hybrid_res.get("edges", edges),
                "base_matrix": hybrid_res.get("base_matrix", matrix),
                "effective_matrix": hybrid_res.get("effective_matrix", []),
                "matrix": hybrid_res.get("effective_matrix", matrix),
                "unconfigured_nodes": unconfigured,
                "all_dict_count": len(all_dict_node_ids),
                "main_entrance_id": main_ent
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # 2. If no saved matrix exists on disk, canvas is completely empty
    unconfigured = [
        {
            "node_id": nid,
            "location": target_dict[nid].get("location", f"Node {nid}"),
            "hazard_flag": target_dict[nid].get("hazard_flag", "SAFE"),
            "blocked": target_dict[nid].get("blocked", False)
        }
        for nid in all_dict_node_ids
    ]

    return jsonify({
        "exists": False,
        "mode": safe_mode,
        "nodes": [],
        "node_positions": {},
        "edges": [],
        "base_matrix": [],
        "effective_matrix": [],
        "matrix": [],
        "unconfigured_nodes": unconfigured,
        "all_dict_count": len(all_dict_node_ids)
    })

@app.route("/api/graph/save", methods=["POST"])
def save_graph():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    mode = data.get("mode", "live")
    safe_mode = "test" if mode == "test" else "live"
    file_json, file_txt = get_graph_file_paths(safe_mode)

    raw_nodes = data.get("nodes", [])
    raw_edges = data.get("edges", [])

    nodes_detail = []
    node_ids = []
    node_positions = {}

    for item in raw_nodes:
        if isinstance(item, dict):
            nid = str(item.get("node_id") or item.get("id"))
            ntype = str(item.get("node_type") or ("exit" if nid.startswith("EXIT") else "sensor"))
            if nid and nid not in node_ids:
                node_ids.append(nid)
                pos = item.get("position_2d") or {"x": item.get("x", 0), "y": item.get("y", 0)}
                node_positions[nid] = pos
                nodes_detail.append({
                    "id": nid,
                    "node_id": nid,
                    "node_type": ntype,
                    "position_2d": pos
                })
        elif isinstance(item, str):
            if item not in node_ids:
                node_ids.append(item)
                nodes_detail.append({
                    "id": item,
                    "node_id": item,
                    "node_type": "exit" if item.startswith("EXIT") else "sensor",
                    "position_2d": {"x": 0, "y": 0}
                })

    for e in raw_edges:
        u = str(e.get("from"))
        v = str(e.get("to"))
        if u and u not in node_ids:
            node_ids.append(u)
        if v and v not in node_ids:
            node_ids.append(v)

    N = len(node_ids)
    node_index = {nid: i for i, nid in enumerate(node_ids)}

    # Initialize 2D Matrix (weights = distance, 0 on diagonal, -1 for inaccessible)
    matrix = [[-1.0 if i != j else 0.0 for j in range(N)] for i in range(N)]

    edges_list = []
    for e in raw_edges:
        u = str(e.get("from"))
        v = str(e.get("to"))
        if u in node_index and v in node_index:
            i = node_index[u]
            j = node_index[v]

            if "distance" in e and e["distance"] is not None:
                dist = float(e["distance"])
            elif u in node_positions and v in node_positions:
                p1 = node_positions[u]
                p2 = node_positions[v]
                dist = round(math.hypot(p2["x"] - p1["x"], p2["y"] - p1["y"]), 2)
            else:
                dist = 20.0

            matrix[i][j] = dist
            matrix[j][i] = dist

            edges_list.append({
                "from": u,
                "to": v,
                "from_display": e.get("from_display", "A"),
                "to_display": e.get("to_display", "A"),
                "base_distance": dist,
                "distance": dist
            })

    main_entrance_id = data.get("main_entrance_id") or data.get("main_exit_id", None)

    # Save to Disk
    graph_payload = {
        "mode": safe_mode,
        "updated_at": time.time(),
        "node_count": N,
        "nodes": nodes_detail,
        "node_positions": node_positions,
        "edges": edges_list,
        "matrix": matrix,
        "main_entrance_id": main_entrance_id
    }

    with open(file_json, "w") as f:
        json.dump(graph_payload, f, indent=2)

    with open(file_txt, "w") as f:
        f.write("=" * 80 + "\n")
        f.write(f"AEGIS EVACUATION GRAPH 2D ADJACENCY MATRIX [{safe_mode.upper()}] (Saved: {time.ctime()})\n")
        f.write("Weights represent distance; -1 represents inaccessible / no connection\n")
        f.write("=" * 80 + "\n\n")

        if N > 0:
            col_header = "NODE".ljust(12) + "".join(nid.rjust(10) for nid in node_ids)
            f.write(col_header + "\n")
            f.write("-" * len(col_header) + "\n")

            for i, nid in enumerate(node_ids):
                row_str = nid.ljust(12)
                for j in range(N):
                    val = matrix[i][j]
                    if val == -1:
                        row_str += "-1".rjust(10)
                    else:
                        row_str += f"{val:.1f}".rjust(10)
                f.write(row_str + "\n")
        else:
            f.write("Empty matrix (No nodes defined)\n")

    # Populate nested dictionary
    target_dict = test_nodes if safe_mode == "test" else nodes
    current_keys = set(target_dict.keys())
    new_keys = set(node_ids)

    for nid in node_ids:
        pos = node_positions.get(nid, {"x": 0, "y": 0})
        if nid in target_dict:
            target_dict[nid]["position_2d"] = pos
            target_dict[nid]["node_id"] = nid
        else:
            target_dict[nid] = {
                "node_id": nid,
                "floor": 1,
                "location": f"Corridor Node {nid}",
                "is_physical": (safe_mode == "live"),
                "active": True,
                "blocked": False,
                "hazard_flag": "SAFE",
                "display_a": "FORWARD",
                "display_b": "STOP",
                "people_count": 0,
                "area_ratio": 0.0,
                "flow": 0,
                "temperature": 24.0,
                "smoke_ppm": 10.0,
                "flame_detected": False,
                "position_2d": pos
            }

    # Delete nodes not present in layout
    for d_key in (current_keys - new_keys):
        target_dict.pop(d_key, None)

    print(f"[AEGIS] Saved 2D Graph Matrix for '{safe_mode}' ({N}x{N}) to {file_json}")

    return jsonify({
        "status": "saved",
        "mode": safe_mode,
        "file_json": file_json,
        "file_txt": file_txt,
        "node_count": N,
        "nodes": node_ids,
        "matrix": matrix,
        "edges": edges_list,
        "dict_keys": list(target_dict.keys())
    })

# ==============================================================================
# START SERVER
# ==============================================================================

if __name__ == "__main__":
    print(f"[Dynamic Exit Router] Serving frontend from: {FRONTEND_DIR}")
    print("[Dynamic Exit Router] Server running on http://localhost:5000")
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )
