import type { FeatureDoc } from "../../../../scripts/living-docs/document.ts";
import { count, featureOf, moduleLabel } from "./format.ts";

const GRAPH = {
	nodeWidth: 200,
	nodeHeight: 34,
	rowGap: 12,
	columnGap: 120,
	padding: 16,
	titleHeight: 24,
	labelCharWidth: 7.6,
	sublabelCharWidth: 6.2,
};

interface GraphNode {
	id: string;
	label: string;
	sublabel: string;
	kind: string;
}

/** Layout of a feature's "who imports who" graph: what its modules depend on, the modules and what uses them. */
export function dependencyGraph(feature: FeatureDoc) {
	const modulePaths = new Set(feature.modules.map((module) => module.path));
	const dependencies = [
		...new Set(
			feature.modules.flatMap((module) =>
				module.dependencies.filter(
					(dependency) => !modulePaths.has(dependency),
				),
			),
		),
	];

	const consumerNodes = new Map<string, Omit<GraphNode, "id">>();
	const consumerEdges: Array<{ from: string; to: string }> = [];
	const internalEdges: Array<{ from: string; to: string }> = [];

	for (const module of feature.modules) {
		for (const dependency of module.dependencies) {
			if (modulePaths.has(dependency)) {
				internalEdges.push({ from: dependency, to: module.path });
			}
		}

		for (const group of module.dependents) {
			if (group.kind === "module") {
				for (const item of group.items) {
					if (modulePaths.has(item.file)) continue;
					consumerNodes.set(item.file, {
						label: moduleLabel(item.file),
						sublabel: featureOf(item.file),
						kind: "module",
					});
					consumerEdges.push({ from: module.path, to: item.file });
				}
				continue;
			}

			const key = `kind:${group.kind}`;
			const total = new Set(
				feature.modules.flatMap((candidate) =>
					candidate.dependents
						.filter((other) => other.kind === group.kind)
						.flatMap((other) => other.items.map((item) => item.file)),
				),
			).size;
			consumerNodes.set(key, {
				label: group.label,
				sublabel: count(total, "file"),
				kind: group.kind,
			});
			consumerEdges.push({ from: module.path, to: key });
		}
	}

	const columns: GraphNode[][] = [
		dependencies.map((dependency) => ({
			id: dependency,
			label: moduleLabel(dependency),
			sublabel: featureOf(dependency),
			kind: "dependency",
		})),
		feature.modules.map((module) => ({
			id: module.path,
			label: module.name,
			sublabel: count(module.types.length + module.values.length, "export"),
			kind: "self",
		})),
		[...consumerNodes].map(([id, node]) => ({ id, ...node })),
	];

	const rows = Math.max(...columns.map((column) => column.length), 1);
	const height =
		GRAPH.padding * 2 +
		rows * (GRAPH.nodeHeight + GRAPH.rowGap) -
		GRAPH.rowGap +
		GRAPH.titleHeight;
	const width = GRAPH.padding * 2 + GRAPH.nodeWidth * 3 + GRAPH.columnGap * 2;
	const columnX = (columnIndex: number) =>
		GRAPH.padding + columnIndex * (GRAPH.nodeWidth + GRAPH.columnGap);

	const nodes = columns.flatMap((column, columnIndex) => {
		const columnHeight =
			column.length * (GRAPH.nodeHeight + GRAPH.rowGap) - GRAPH.rowGap;
		const top =
			GRAPH.titleHeight +
			GRAPH.padding +
			(height - GRAPH.titleHeight - GRAPH.padding * 2 - columnHeight) / 2;

		return column.map((node, rowIndex) => ({
			...node,
			sublabel: fitSublabel(node.label, node.sublabel),
			x: columnX(columnIndex),
			y: top + rowIndex * (GRAPH.nodeHeight + GRAPH.rowGap),
		}));
	});
	const positions = new Map(nodes.map((node) => [node.id, node]));

	const edge = (from: string, to: string, isInternal = false) => {
		const source = positions.get(from);
		const target = positions.get(to);
		if (!source || !target) return null;

		const y1 = source.y + GRAPH.nodeHeight / 2;
		const y2 = target.y + GRAPH.nodeHeight / 2;
		if (isInternal) {
			const x = source.x;
			return {
				from,
				to,
				d: `M${x} ${y1} C${x - 40} ${y1}, ${x - 40} ${y2}, ${x} ${y2}`,
			};
		}

		const x1 = source.x + GRAPH.nodeWidth;
		const x2 = target.x;
		const bend = GRAPH.columnGap / 2;
		return {
			from,
			to,
			d: `M${x1} ${y1} C${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2 - 4} ${y2}`,
		};
	};

	const edges = [
		...feature.modules.flatMap((module) =>
			module.dependencies
				.filter((dependency) => !modulePaths.has(dependency))
				.map((dependency) => edge(dependency, module.path)),
		),
		...internalEdges.map(({ from, to }) => edge(from, to, true)),
		...consumerEdges.map(({ from, to }) => edge(from, to)),
	].filter((path) => path !== null);

	return {
		width,
		height,
		padding: GRAPH.padding,
		nodeWidth: GRAPH.nodeWidth,
		nodeHeight: GRAPH.nodeHeight,
		columnTitles: [
			"Depends on",
			`${feature.config.label} modules`,
			"Used by",
		].map((title, index) => ({ title, x: columnX(index) })),
		nodes,
		edges,
	};
}

/** Shortens a node's sublabel so it fits next to the label, widths estimated per character. */
function fitSublabel(label: string, sublabel: string) {
	const room = Math.floor(
		(GRAPH.nodeWidth - 24 - label.length * GRAPH.labelCharWidth) /
			GRAPH.sublabelCharWidth,
	);
	if (room <= 2) return "";
	return sublabel.length > room ? `${sublabel.slice(0, room - 1)}…` : sublabel;
}
