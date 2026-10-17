import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./ast.ts";

const PLUGINS_DIR = "lint-plugins";
const PLUGIN_INDEX = `${PLUGINS_DIR}/index.ts`;
const LINT_CONFIG = "bunfig.toml";
const PLUGIN_NAMESPACE = "sendou";
const GLOBAL_RULES_HEADER = "[lint.rules]";
const STRING_PATTERN = String.raw`"((?:[^"\\]|\\.)*)"`;

export interface LintRule {
	/** The rule's name without the plugin namespace, e.g. `no-raw-search-params`. */
	name: string;
	file: string;
	/** The rule's `meta.docs.description`: what it enforces. */
	description: string;
	/** The diagnostics it reports. */
	messages: string[];
	/** Globs of `bunfig.toml` the rule is enabled for, `!` ones excluded. */
	includes: string[];
	source: string;
}

/** The repo's own lint rules: the `sendou` plugin of `lint-plugins/` and where `bunfig.toml` enables its rules. */
export function documentLintRules(): LintRule[] {
	const config = fs.readFileSync(path.join(ROOT, LINT_CONFIG), "utf8");
	const index = fs.readFileSync(path.join(ROOT, PLUGIN_INDEX), "utf8");

	return [...index.matchAll(/import \{ \w+ \} from "\.\/([\w-]+)";/g)]
		.map(([, name]) => name)
		.sort()
		.map((name) => {
			const file = `${PLUGINS_DIR}/${name}.ts`;
			const source = fs.readFileSync(path.join(ROOT, file), "utf8");
			const messagesBlock =
				source.match(/messages: \{([\s\S]*?)\n\t\t\},/)?.[1] ?? "";

			return {
				name,
				file,
				description: unescape(
					source.match(new RegExp(`description:\\s*${STRING_PATTERN}`))?.[1] ??
						"",
				),
				messages: [
					...new Set(
						[
							...messagesBlock.matchAll(
								new RegExp(`\\w+:\\s*${STRING_PATTERN}`, "g"),
							),
						].map(([, message]) => unescape(message)),
					),
				],
				includes: enabledGlobs(config, `${PLUGIN_NAMESPACE}/${name}`),
				source,
			};
		});
}

/** Everywhere when `[lint.rules]` turns the rule on (minus the overrides turning it off), else the `files` (and `!excludeFiles`) of the `[[lint.overrides]]` turning it on. */
function enabledGlobs(config: string, rule: string) {
	const isEnabled = (text: string) =>
		new RegExp(`"${rule}" = (?!"off")`).test(text);

	const [globalSection, ...overrides] = config
		.slice(config.indexOf(GLOBAL_RULES_HEADER) + GLOBAL_RULES_HEADER.length)
		.split("[[lint.overrides]]");
	if (isEnabled(globalSection.split(/^\[/m)[0])) {
		return [
			"**",
			...overrides
				.filter((override) => override.includes(`"${rule}" = "off"`))
				.flatMap((override) => globsOf(override, "files"))
				.map((glob) => `!${glob}`),
		];
	}

	return overrides
		.filter((override) => isEnabled(override))
		.flatMap((override) => [
			...globsOf(override, "files"),
			...globsOf(override, "excludeFiles").map((glob) => `!${glob}`),
		]);
}

function globsOf(override: string, key: string) {
	const list = override.match(new RegExp(`^${key} = \\[([^\\]]*)\\]`, "m"));
	if (!list) return [];

	return [...list[1].matchAll(new RegExp(STRING_PATTERN, "g"))].map(
		([, glob]) => glob,
	);
}

function unescape(value: string) {
	return value.replaceAll('\\"', '"');
}
