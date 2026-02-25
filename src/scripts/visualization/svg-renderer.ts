/**
 * SVG Renderer
 *
 * Generates SVG markup from Sugiyama layout results.
 * All text content is escaped for XSS prevention.
 * Zero runtime dependencies.
 */

import { escapeHtml } from '../security/sanitizer';
import type { LayoutResult, LayoutNode, LayoutEdge } from './sugiyama-layout';

// ============================================================================
// SVG Generation
// ============================================================================

/**
 * Render layout result to SVG string.
 */
export function renderSVG(layout: LayoutResult): string {
  if (layout.nodes.length === 0) {
    return renderEmptySVG();
  }

  const { width, height, nodes, edges } = layout;
  const lines: string[] = [];

  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
  lines.push('<defs>');
  lines.push(renderArrowMarkers());
  lines.push('</defs>');
  lines.push(renderStyles());

  // Build node lookup map once — O(N) instead of O(E*N) with nodes.find per edge
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Render edges first (below nodes)
  lines.push('<g class="edges">');
  for (const edge of edges) {
    lines.push(renderEdge(edge, nodeMap));
  }
  lines.push('</g>');

  // Render nodes
  lines.push('<g class="nodes">');
  for (const node of nodes) {
    lines.push(renderNode(node));
  }
  lines.push('</g>');

  lines.push('</svg>');
  return lines.join('\n');
}

/**
 * Render a list view (fallback when Worker crashes or graph is too large).
 */
export function renderListView(
  tables: { name: string; severity?: string; issueCount: number }[]
): string {
  const lines: string[] = [];
  const height = tables.length * 32 + 20;
  const width = 400;

  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`);
  lines.push(renderStyles());

  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    const y = 10 + i * 32;
    const fillClass = t.severity === 'error' ? 'node-error' : t.severity === 'warning' ? 'node-warning' : 'node-default';

    lines.push(`<g class="${fillClass}" transform="translate(10, ${y})">`);
    lines.push(`<rect width="380" height="28" rx="4" />`);
    lines.push(`<text x="10" y="18" class="node-label">${escapeHtml(t.name)}</text>`);
    lines.push(`<text x="370" y="18" text-anchor="end" class="node-count">${t.issueCount}</text>`);
    lines.push('</g>');
  }

  lines.push('</svg>');
  return lines.join('\n');
}

// ============================================================================
// Rendering Helpers
// ============================================================================

function renderNode(node: LayoutNode): string {
  const fillClass = getSeverityClass(node.severity);
  const label = escapeHtml(truncateLabel(node.label, 20));

  return `<g class="node ${fillClass}" data-table="${escapeHtml(node.id)}" transform="translate(${node.x}, ${node.y})">
  <rect width="${node.width}" height="${node.height}" rx="6" />
  <text x="${node.width / 2}" y="${node.height / 2 + 5}" text-anchor="middle" class="node-label">${label}</text>
</g>`;
}

function renderEdge(edge: LayoutEdge, nodeMap: Map<string, LayoutNode>): string {
  const fromNode = nodeMap.get(edge.from);
  const toNode = nodeMap.get(edge.to);

  if (!fromNode || !toNode) return '';

  // From bottom-center of source to top-center of target
  const x1 = fromNode.x + fromNode.width / 2;
  const y1 = fromNode.y + fromNode.height;
  const x2 = toNode.x + toNode.width / 2;
  const y2 = toNode.y;

  const dashArray = edge.style === 'dashed' ? ' stroke-dasharray="5,5"' : '';
  const colorAttr = edge.color ? ` stroke="${escapeHtml(edge.color)}"` : '';
  const cssClass = edge.reversed ? 'edge reversed' : 'edge';

  // Simple bezier curve
  const midY = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  return `<path class="${cssClass}" d="${d}" marker-end="url(#arrowhead)"${dashArray}${colorAttr} />`;
}

function renderArrowMarkers(): string {
  return `<marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
  <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
</marker>`;
}

function renderStyles(): string {
  return `<style>
  .node rect { fill: #f8fafc; stroke: #cbd5e1; stroke-width: 1.5; cursor: pointer; }
  .node:hover rect { stroke: #3b82f6; stroke-width: 2; }
  .node-error rect { fill: #fef2f2; stroke: #dc2626; stroke-width: 2; }
  .node-warning rect { fill: #fffbeb; stroke: #f59e0b; stroke-width: 2; }
  .node-info rect { fill: #eff6ff; stroke: #3b82f6; stroke-width: 1.5; }
  .node-default rect { fill: #f8fafc; stroke: #cbd5e1; stroke-width: 1.5; }
  .node-label { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; fill: #1e293b; pointer-events: none; }
  .node-count { font-family: monospace; font-size: 11px; fill: #64748b; }
  .edge { fill: none; stroke: #94a3b8; stroke-width: 1.5; }
  .edge.reversed { stroke: #dc2626; stroke-dasharray: 5,3; }
</style>`;
}

function renderEmptySVG(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 60" width="300" height="60">
  <text x="150" y="35" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="14">FK 관계가 없습니다</text>
</svg>`;
}

function getSeverityClass(severity?: string): string {
  switch (severity) {
    case 'error': return 'node-error';
    case 'warning': return 'node-warning';
    case 'info': return 'node-info';
    default: return 'node-default';
  }
}

function truncateLabel(label: string, maxLen: number): string {
  if (label.length <= maxLen) return label;
  return label.substring(0, maxLen - 1) + '\u2026';
}
