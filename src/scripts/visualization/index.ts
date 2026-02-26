/**
 * Visualization Module
 *
 * Barrel export for FK dependency visualization.
 */

export { computeSugiyamaLayout } from './sugiyama-layout';
export type { LayoutNode, LayoutEdge, LayoutResult, GraphInput } from './sugiyama-layout';

export { renderSVG, renderListView } from './svg-renderer';

export { buildGraphFromContext, NODE_CAP, EDGE_CAP } from './graph-builder';
export type { GraphBuildResult } from './graph-builder';
