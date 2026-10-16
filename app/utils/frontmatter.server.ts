const FRONTMATTER_PATTERN = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const KEY_PATTERN = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/;
const FLOW_LIST_ITEM_PATTERN =
	/\s*("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^,]+?)\s*(?:,|$)/g;
const UNSUPPORTED_VALUE_START = ["{", "|", ">", "&", "*", "!", "%", "@", "`"];

/**
 * Splits a markdown file into its frontmatter and the markdown content after it. The frontmatter
 * is the subset of YAML the content files use (scalars, `[a, b]` lists, block lists of scalars or
 * of flat maps), anything else throws so it can't be silently misread. Scalars stay strings.
 */
export function parseFrontmatter(markdown: string): {
	data: Record<string, unknown>;
	content: string;
} {
	const match = FRONTMATTER_PATTERN.exec(markdown);
	if (!match) return { data: {}, content: markdown };

	return {
		data: parseYamlSubset(match[1]),
		content: markdown.slice(match[0].length),
	};
}

function parseYamlSubset(yaml: string) {
	const data: Record<string, unknown> = {};
	let listKey: string | null = null;
	let currentItem: Record<string, string> | null = null;

	for (const rawLine of yaml.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;

		const isIndented = rawLine.length > rawLine.trimStart().length;

		if (line === "-" || line.startsWith("- ")) {
			if (!listKey) throw unsupportedLine(rawLine);

			if (!data[listKey]) data[listKey] = [];
			const list = data[listKey] as unknown[];
			const item = line.slice(1).trim();
			const itemKey = KEY_PATTERN.exec(item);
			if (itemKey?.[2]) {
				currentItem = { [itemKey[1]]: parseScalar(itemKey[2], rawLine) };
				list.push(currentItem);
			} else {
				currentItem = null;
				list.push(parseScalar(item, rawLine));
			}
			continue;
		}

		const keyMatch = KEY_PATTERN.exec(line);
		if (!keyMatch) throw unsupportedLine(rawLine);
		const [, key, value] = keyMatch;

		if (isIndented) {
			if (!currentItem || !value) throw unsupportedLine(rawLine);
			currentItem[key] = parseScalar(value, rawLine);
			continue;
		}

		currentItem = null;
		if (value) {
			listKey = null;
			data[key] = value.startsWith("[")
				? parseFlowList(value, rawLine)
				: parseScalar(value, rawLine);
		} else {
			listKey = key;
			data[key] = null;
		}
	}

	return data;
}

function parseFlowList(value: string, line: string) {
	if (!value.endsWith("]")) throw unsupportedLine(line);

	const inner = value.slice(1, -1).trim();
	if (inner === "") return [];

	return [...inner.matchAll(FLOW_LIST_ITEM_PATTERN)]
		.filter((match) => match[0].trim() !== "")
		.map((match) => parseScalar(match[1], line));
}

function parseScalar(value: string, line: string): string {
	if (value.startsWith('"')) {
		if (!value.endsWith('"') || value.length < 2) throw unsupportedLine(line);
		return JSON.parse(value);
	}

	if (value.startsWith("'")) {
		if (!value.endsWith("'") || value.length < 2) throw unsupportedLine(line);
		return value.slice(1, -1).replaceAll("''", "'");
	}

	if (
		UNSUPPORTED_VALUE_START.some((start) => value.startsWith(start)) ||
		value.startsWith("[")
	) {
		throw unsupportedLine(line);
	}

	return value.replace(/\s+#.*$/, "").trim();
}

function unsupportedLine(line: string) {
	return new Error(`Unsupported frontmatter syntax: "${line}"`);
}
