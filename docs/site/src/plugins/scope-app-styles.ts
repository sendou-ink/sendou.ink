import path from "node:path";
import type { Node, Plugin as PostcssPlugin } from "postcss";

/**
 * Keeps the app's global stylesheets (`app/styles`) to the components showcase: their selectors are
 * scoped under `scope` (and the dialogs the app portals to `<body>`), `html`, `body` and `:root`
 * becoming `scope` itself. The theme variables (`vars.css`) are left global, Starlight's
 * `data-theme` on `<html>` picks the scheme. The `globals` stay global and also style the elements
 * listed for them, letting Starlight's markup take on an app utility class it can't be given.
 */
export function scopeAppStyles({
	files,
	scope,
	globals = {},
}: {
	files: string[];
	scope: string;
	globals?: Record<string, string[]>;
}): PostcssPlugin {
	const scopedFiles = new Set(files.map((file) => path.resolve(file)));

	const scopeSelector = (selector: string) => {
		const alsoStyled = globals[selector];
		if (alsoStyled) return [selector, ...alsoStyled];

		const documentRoot = selector.match(/^(html|body|:root)(?![\w-])/);
		if (documentRoot) return selector.replace(documentRoot[0], scope);

		return `:where(${scope}, body > dialog) ${selector}`;
	};

	return {
		postcssPlugin: "scope-app-styles",
		Once(root) {
			const file = root.source?.input.file;
			if (!file || !scopedFiles.has(path.resolve(file))) return;

			root.walkRules((rule) => {
				if (isNested(rule) || isInsideKeyframes(rule)) return;
				rule.selectors = rule.selectors.flatMap(scopeSelector);
			});
		},
	};
}

/** A nested rule (`&:hover`) is scoped through its parent. */
function isNested(node: Node) {
	for (let parent = node.parent; parent; parent = parent.parent) {
		if (parent.type === "rule") return true;
	}

	return false;
}

function isInsideKeyframes(node: Node) {
	for (let parent = node.parent; parent; parent = parent.parent) {
		if (
			parent.type === "atrule" &&
			"name" in parent &&
			/keyframes$/.test(String(parent.name))
		) {
			return true;
		}
	}

	return false;
}
