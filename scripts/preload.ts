/**
 * Preload (`bun --preload ./scripts/preload.ts`) for scripts that import app code
 * written for Vite: defaults NODE_ENV like Vite does and implements the eager
 * `import.meta.glob` forms the app uses.
 */
import path from "node:path";
import { plugin } from "bun";

const ROOT_DIR = path.join(import.meta.dir, "..");
const GLOB_CALL_PATTERN = /import\.meta\.glob(?:<[^(]*>)?\(/g;

process.env.NODE_ENV ??= "development";

plugin({
	name: "import-meta-glob",
	setup(build) {
		build.onLoad({ filter: /\/app\/.+\.tsx?$/ }, async ({ path: filePath }) => {
			const source = await Bun.file(filePath).text();
			const loader = filePath.endsWith("x") ? "tsx" : "ts";
			if (!source.includes("import.meta.glob")) {
				return { contents: source, loader };
			}

			return { contents: withGlobsExpanded(source, filePath), loader };
		});
	},
});

function withGlobsExpanded(source: string, filePath: string) {
	const imports: string[] = [];
	let result = "";
	let lastIndex = 0;

	for (const match of source.matchAll(GLOB_CALL_PATTERN)) {
		const argsStart = match.index + match[0].length;
		const argsEnd = closingParenIndex(source, argsStart);
		const [patterns, options = {}] = new Function(
			`return [${source.slice(argsStart, argsEnd)}]`,
		)() as [string | string[], GlobOptions?];

		if (!options.eager) {
			throw new Error(
				`${filePath}: only eager import.meta.glob is supported in scripts`,
			);
		}

		const entries = matchingFiles(patterns, path.dirname(filePath)).map(
			(relativePath) => {
				if (options.query === "?url") {
					const absolutePath = path.join(path.dirname(filePath), relativePath);
					return `${JSON.stringify(relativePath)}: ${JSON.stringify(`/${path.relative(ROOT_DIR, absolutePath)}`)}`;
				}

				const identifier = `__glob_${imports.length}`;
				imports.push(
					options.import === "default"
						? `import ${identifier} from ${JSON.stringify(relativePath)};`
						: `import * as ${identifier} from ${JSON.stringify(relativePath)};`,
				);
				return `${JSON.stringify(relativePath)}: ${identifier}`;
			},
		);

		result += `${source.slice(lastIndex, match.index)}({${entries.join(",")}})`;
		lastIndex = argsEnd + 1;
	}

	return `${imports.join("\n")}\n${result}${source.slice(lastIndex)}`;
}

interface GlobOptions {
	eager?: boolean;
	import?: string;
	query?: string;
}

function matchingFiles(patterns: string | string[], cwd: string) {
	const allPatterns = Array.isArray(patterns) ? patterns : [patterns];
	const included = allPatterns.filter((pattern) => !pattern.startsWith("!"));
	const excluded = allPatterns
		.filter((pattern) => pattern.startsWith("!"))
		.map((pattern) => new Bun.Glob(pattern.slice(1)));

	const files = new Set<string>();
	for (const pattern of included) {
		const segments = pattern.split("/");
		const firstGlobSegment = segments.findIndex((segment) =>
			/[*?[{]/.test(segment),
		);
		const base = segments.slice(0, firstGlobSegment).join("/");
		const rest = segments.slice(firstGlobSegment).join("/");

		for (const file of new Bun.Glob(rest).scanSync({
			cwd: path.join(cwd, base),
		})) {
			const relativePath = `${base}/${file}`;
			if (excluded.some((glob) => glob.match(relativePath))) continue;
			files.add(relativePath);
		}
	}

	return [...files].sort();
}

function closingParenIndex(source: string, start: number) {
	let depth = 1;
	for (let i = start; i < source.length; i++) {
		if (source[i] === "(") depth++;
		if (source[i] === ")") depth--;
		if (depth === 0) return i;
	}

	throw new Error("Unbalanced import.meta.glob call");
}
