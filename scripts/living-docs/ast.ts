import fs from "node:fs";
import path from "node:path";
import {
	type Comment,
	type Node,
	type Program,
	parseSync,
	type StaticImport,
	visitorKeys,
} from "oxc-parser";

export const ROOT = path.resolve(import.meta.dirname, "../..");

export interface ParsedFile {
	/** Repo relative, forward slashes. */
	path: string;
	source: string;
	program: Program;
	comments: Comment[];
	imports: StaticImport[];
	lineStarts: number[];
}

const caches: Array<Map<unknown, unknown>> = [];
const cache = createCache<string, ParsedFile>();

/** A memo cache emptied by `clearCaches`, so a rerun sees edited files. */
export function createCache<K, V>() {
	const map = new Map<K, V>();
	caches.push(map as Map<unknown, unknown>);
	return map;
}

export function clearCaches() {
	for (const map of caches) map.clear();
}

/** Parses (once) a repo relative TypeScript file. */
export function parseFile(relativePath: string): ParsedFile {
	const cached = cache.get(relativePath);
	if (cached) return cached;

	const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
	const result = parseSync(relativePath, source);

	const lineStarts = [0];
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "\n") lineStarts.push(i + 1);
	}

	const parsed: ParsedFile = {
		path: relativePath,
		source,
		program: result.program,
		comments: result.comments,
		imports: result.module.staticImports,
		lineStarts,
	};
	cache.set(relativePath, parsed);

	return parsed;
}

/** 1-based line of a source offset. */
export function lineOf(file: ParsedFile, offset: number) {
	let low = 0;
	let high = file.lineStarts.length - 1;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (file.lineStarts[mid] <= offset) low = mid;
		else high = mid - 1;
	}

	return low + 1;
}

/** Source text of a node, dedented as it would read on its own. */
export function textOf(file: ParsedFile, node: { start: number; end: number }) {
	const lineStart = file.lineStarts[lineOf(file, node.start) - 1];
	const indent = file.source.slice(lineStart, node.start).match(/^[\t ]*/)![0];
	const text = file.source.slice(node.start, node.end);
	const lines = `${indent}${text}`.split("\n");
	const shared = Math.min(
		...lines
			.filter((line) => line.trim() !== "")
			.map((line) => line.match(/^[\t ]*/)![0].length),
	);

	return lines.map((line) => line.slice(shared)).join("\n");
}

/** Visits every node below `node` depth first, `visit` returning false skips a node's children. */
export function walk(node: Node, visit: (node: Node) => boolean | undefined) {
	if (visit(node) === false) return;

	for (const key of visitorKeys[node.type] ?? []) {
		const child = (node as any)[key];
		if (Array.isArray(child)) {
			for (const item of child) {
				if (item && typeof item.type === "string") walk(item, visit);
			}
		} else if (child && typeof child.type === "string") {
			walk(child, visit);
		}
	}
}

/** The `/** … *\/` comment directly above a node (only whitespace between). */
export function jsDocOf(file: ParsedFile, start: number) {
	const comment = file.comments.findLast(
		(candidate) =>
			candidate.end <= start &&
			candidate.type === "Block" &&
			candidate.value.startsWith("*") &&
			file.source.slice(candidate.end, start).trim() === "",
	);
	if (!comment) return null;

	return parseJsDoc(comment.value);
}

export interface JsDoc {
	description: string;
	tags: Array<{ tag: string; text: string }>;
}

function parseJsDoc(raw: string): JsDoc {
	const lines = raw
		.replace(/^\*/, "")
		.split("\n")
		.map((line) => line.replace(/^\s*\* ?/, "").trimEnd());

	const description: string[] = [];
	const tags: JsDoc["tags"] = [];
	for (const line of lines) {
		const tagMatch = line.match(/^@(\w+)\s*(.*)$/);
		if (tagMatch) tags.push({ tag: tagMatch[1], text: tagMatch[2] });
		else if (tags.length > 0) tags.at(-1)!.text += ` ${line.trim()}`;
		else description.push(line);
	}

	return { description: description.join("\n").trim(), tags };
}

/** Comments between two offsets, `//` ones joined into paragraphs. */
export function commentsBetween(file: ParsedFile, from: number, to: number) {
	const paragraphs: string[] = [];
	let previousEnd = -1;

	for (const comment of file.comments) {
		if (comment.start < from || comment.end > to) continue;
		const text = comment.value
			.replace(/^\*/, "")
			.split("\n")
			.map((line) => line.replace(/^\s*\* ?/, "").trim())
			.join(" ")
			.trim();
		if (text.startsWith("biome-ignore")) continue;

		const continuesPrevious =
			previousEnd !== -1 &&
			comment.type === "Line" &&
			file.source.slice(previousEnd, comment.start).split("\n").length === 2;

		if (continuesPrevious) paragraphs[paragraphs.length - 1] += ` ${text}`;
		else paragraphs.push(text);
		previousEnd = comment.end;
	}

	return paragraphs;
}
