import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./ast.ts";

const PLUGINS_DIR = "biome-plugins";
const BIOME_CONFIG = "biome.json";

export interface LintRule {
	/** File name without `.grit`, e.g. `no-raw-search-params`. */
	name: string;
	file: string;
	/** The comment at the top of the plugin: what it enforces and why. */
	description: string;
	/** The diagnostics it reports. */
	messages: string[];
	/** Globs of `biome.json` the plugin is enabled for, `!` ones excluded. */
	includes: string[];
	source: string;
}

/** The repo's own lint rules: the GritQL plugins of `biome-plugins/` and where `biome.json` enables them. */
export function documentLintRules(): LintRule[] {
	const config = JSON.parse(
		fs.readFileSync(path.join(ROOT, BIOME_CONFIG), "utf8"),
	) as { overrides?: Array<{ includes?: string[]; plugins?: string[] }> };

	return fs
		.readdirSync(path.join(ROOT, PLUGINS_DIR))
		.filter((name) => name.endsWith(".grit"))
		.sort()
		.map((name) => {
			const file = `${PLUGINS_DIR}/${name}`;
			const source = fs.readFileSync(path.join(ROOT, file), "utf8");

			return {
				name: name.replace(/\.grit$/, ""),
				file,
				description: leadingComment(source),
				messages: [
					...new Set(
						[...source.matchAll(/message\s*=\s*"((?:[^"\\]|\\.)*)"/g)].map(
							([, message]) => message.replaceAll('\\"', '"'),
						),
					),
				],
				includes: (config.overrides ?? [])
					.filter((override) =>
						override.plugins?.some((plugin) => plugin.endsWith(`/${name}`)),
					)
					.flatMap((override) => override.includes ?? []),
				source,
			};
		});
}

/** The `//` lines at the top of the file (after `language …`), joined into paragraphs. */
function leadingComment(source: string) {
	const paragraphs: string[][] = [[]];
	for (const line of source.split("\n").slice(1)) {
		const comment = line.match(/^\s*\/\/\s?(.*)$/);
		if (!comment) {
			if (line.trim() === "" && paragraphs.flat().length === 0) continue;
			break;
		}
		if (comment[1].trim() === "") paragraphs.push([]);
		else paragraphs.at(-1)!.push(comment[1].trim());
	}

	return paragraphs
		.filter((paragraph) => paragraph.length > 0)
		.map((paragraph) => paragraph.join(" "))
		.join("\n\n");
}
