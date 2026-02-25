/**
 * Sugiyama Layout Algorithm
 *
 * Pure JS implementation of hierarchical graph layout.
 * Steps: cycle removal → layer assignment → crossing minimization → coordinate assignment
 *
 * Zero runtime dependencies.
 */

// ============================================================================
// Types
// ============================================================================

export interface LayoutNode {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
  /** Severity of the most severe issue on this table */
  severity?: 'error' | 'warning' | 'info' | 'none';
}

export interface LayoutEdge {
  from: string;
  to: string;
  /** True if the edge was reversed to break a cycle */
  reversed: boolean;
  /** Style hint: 'dashed' for charset mismatch edges */
  style?: 'solid' | 'dashed';
  /** Color hint */
  color?: string;
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export interface GraphInput {
  nodes: { id: string; label: string; severity?: 'error' | 'warning' | 'info' | 'none' }[];
  edges: { from: string; to: string; style?: 'solid' | 'dashed'; color?: string }[];
}

// ============================================================================
// Constants
// ============================================================================

const NODE_WIDTH = 160;
const NODE_HEIGHT = 40;
const LAYER_GAP = 80;
const NODE_GAP = 30;

// ============================================================================
// Main Layout Function
// ============================================================================

/**
 * Compute Sugiyama hierarchical layout for a directed graph.
 */
export function computeSugiyamaLayout(input: GraphInput): LayoutResult {
  if (input.nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  // Single node
  if (input.nodes.length === 1) {
    const node = input.nodes[0];
    return {
      nodes: [{
        id: node.id,
        label: node.label,
        x: NODE_GAP,
        y: NODE_GAP,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        layer: 0,
        severity: node.severity,
      }],
      edges: input.edges.map(e => ({ ...e, reversed: false })),
      width: NODE_WIDTH + NODE_GAP * 2,
      height: NODE_HEIGHT + NODE_GAP * 2,
    };
  }

  // Step 1: Build adjacency and break cycles
  const { adjList, reversedEdges } = breakCycles(input);

  // Step 2: Assign layers (longest path from sources)
  const layers = assignLayers(input.nodes.map(n => n.id), adjList);

  // Step 3: Order nodes within layers to minimize crossings
  const orderedLayers = minimizeCrossings(layers, adjList);

  // Step 4: Assign coordinates
  const nodeMap = assignCoordinates(orderedLayers, input.nodes);

  // Compute canvas size
  let maxX = 0, maxY = 0;
  for (const node of nodeMap.values()) {
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  // Build result edges
  const resultEdges: LayoutEdge[] = input.edges.map(e => ({
    from: e.from,
    to: e.to,
    reversed: reversedEdges.has(`${e.from}->${e.to}`),
    style: e.style ?? 'solid',
    color: e.color,
  }));

  return {
    nodes: [...nodeMap.values()],
    edges: resultEdges,
    width: maxX + NODE_GAP,
    height: maxY + NODE_GAP,
  };
}

// ============================================================================
// Step 1: Cycle Removal (DFS-based)
// ============================================================================

function breakCycles(input: GraphInput): {
  adjList: Map<string, string[]>;
  reversedEdges: Set<string>;
} {
  const adjList = new Map<string, string[]>();
  const reversedEdges = new Set<string>();

  // Initialize adjacency list
  for (const node of input.nodes) {
    adjList.set(node.id, []);
  }

  // Add edges, detect back edges via DFS
  const edges = input.edges.filter(e =>
    adjList.has(e.from) && adjList.has(e.to)
  );

  for (const e of edges) {
    adjList.get(e.from)!.push(e.to);
  }

  // DFS to find back edges
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const node of input.nodes) {
    color.set(node.id, WHITE);
  }

  function dfs(u: string): void {
    color.set(u, GRAY);
    const neighbors = adjList.get(u) ?? [];
    for (const v of neighbors) {
      if (color.get(v) === GRAY) {
        // Back edge found - reverse it
        reversedEdges.add(`${u}->${v}`);
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    color.set(u, BLACK);
  }

  for (const node of input.nodes) {
    if (color.get(node.id) === WHITE) {
      dfs(node.id);
    }
  }

  // Rebuild adjacency list with reversed edges
  const cleanAdj = new Map<string, string[]>();
  for (const node of input.nodes) {
    cleanAdj.set(node.id, []);
  }
  for (const e of edges) {
    const key = `${e.from}->${e.to}`;
    if (reversedEdges.has(key)) {
      cleanAdj.get(e.to)!.push(e.from);
    } else {
      cleanAdj.get(e.from)!.push(e.to);
    }
  }

  return { adjList: cleanAdj, reversedEdges };
}

// ============================================================================
// Step 2: Layer Assignment (Longest Path)
// ============================================================================

function assignLayers(
  nodeIds: string[],
  adjList: Map<string, string[]>
): Map<number, string[]> {
  // Compute in-degrees
  const inDegree = new Map<string, number>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
  }
  for (const [, neighbors] of adjList) {
    for (const n of neighbors) {
      inDegree.set(n, (inDegree.get(n) ?? 0) + 1);
    }
  }

  // Longest path from sources (BFS-like)
  const layer = new Map<string, number>();
  const queue: string[] = [];

  // Sources: nodes with in-degree 0
  for (const id of nodeIds) {
    if ((inDegree.get(id) ?? 0) === 0) {
      queue.push(id);
      layer.set(id, 0);
    }
  }

  // If no sources (all cycles), pick first node
  if (queue.length === 0 && nodeIds.length > 0) {
    queue.push(nodeIds[0]);
    layer.set(nodeIds[0], 0);
  }

  let idx = 0;
  while (idx < queue.length) {
    const u = queue[idx++];
    const uLayer = layer.get(u) ?? 0;
    const neighbors = adjList.get(u) ?? [];

    for (const v of neighbors) {
      const currentLayer = layer.get(v);
      const newLayer = uLayer + 1;

      if (currentLayer === undefined || newLayer > currentLayer) {
        layer.set(v, newLayer);
      }

      inDegree.set(v, (inDegree.get(v) ?? 1) - 1);
      if ((inDegree.get(v) ?? 0) <= 0 && !queue.includes(v)) {
        queue.push(v);
      }
    }
  }

  // Assign remaining unvisited nodes to layer 0
  for (const id of nodeIds) {
    if (!layer.has(id)) {
      layer.set(id, 0);
    }
  }

  // Group by layer
  const layers = new Map<number, string[]>();
  for (const [id, l] of layer) {
    if (!layers.has(l)) layers.set(l, []);
    layers.get(l)!.push(id);
  }

  return layers;
}

// ============================================================================
// Step 3: Crossing Minimization (Barycenter Heuristic)
// ============================================================================

function minimizeCrossings(
  layers: Map<number, string[]>,
  adjList: Map<string, string[]>
): string[][] {
  const maxLayer = Math.max(...layers.keys(), 0);
  const result: string[][] = [];

  for (let i = 0; i <= maxLayer; i++) {
    result.push(layers.get(i) ?? []);
  }

  // Build reverse adjacency
  const reverseAdj = new Map<string, string[]>();
  for (const [u, neighbors] of adjList) {
    for (const v of neighbors) {
      if (!reverseAdj.has(v)) reverseAdj.set(v, []);
      reverseAdj.get(v)!.push(u);
    }
  }

  // Apply barycenter heuristic (2 passes: down then up)
  for (let pass = 0; pass < 4; pass++) {
    if (pass % 2 === 0) {
      // Down sweep
      for (let i = 1; i <= maxLayer; i++) {
        result[i] = orderByBarycenter(result[i], result[i - 1], reverseAdj);
      }
    } else {
      // Up sweep
      for (let i = maxLayer - 1; i >= 0; i--) {
        result[i] = orderByBarycenter(result[i], result[i + 1], adjList);
      }
    }
  }

  return result;
}

function orderByBarycenter(
  currentLayer: string[],
  fixedLayer: string[],
  connections: Map<string, string[]>
): string[] {
  const positionMap = new Map<string, number>();
  fixedLayer.forEach((id, idx) => positionMap.set(id, idx));

  const barycenters = new Map<string, number>();

  for (const nodeId of currentLayer) {
    const neighbors = (connections.get(nodeId) ?? []).filter(n => positionMap.has(n));
    if (neighbors.length > 0) {
      const sum = neighbors.reduce((acc, n) => acc + (positionMap.get(n) ?? 0), 0);
      barycenters.set(nodeId, sum / neighbors.length);
    } else {
      barycenters.set(nodeId, currentLayer.indexOf(nodeId));
    }
  }

  return [...currentLayer].sort((a, b) => (barycenters.get(a) ?? 0) - (barycenters.get(b) ?? 0));
}

// ============================================================================
// Step 4: Coordinate Assignment
// ============================================================================

function assignCoordinates(
  orderedLayers: string[][],
  inputNodes: GraphInput['nodes']
): Map<string, LayoutNode> {
  const nodeMap = new Map<string, LayoutNode>();
  const inputMap = new Map(inputNodes.map(n => [n.id, n]));

  for (let layerIdx = 0; layerIdx < orderedLayers.length; layerIdx++) {
    const layer = orderedLayers[layerIdx];
    const startX = NODE_GAP;

    for (let nodeIdx = 0; nodeIdx < layer.length; nodeIdx++) {
      const id = layer[nodeIdx];
      const input = inputMap.get(id);

      nodeMap.set(id, {
        id,
        label: input?.label ?? id,
        x: startX + nodeIdx * (NODE_WIDTH + NODE_GAP),
        y: NODE_GAP + layerIdx * (NODE_HEIGHT + LAYER_GAP),
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        layer: layerIdx,
        severity: input?.severity ?? 'none',
      });
    }
  }

  return nodeMap;
}
