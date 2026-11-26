/**
 * Theme CSS: the overlays' stylesheets as a producer's custom CSS refers to them, classes named
 * `.{stylesheet}-{class}`, and checking the custom CSS parses.
 */
import { type AtRule, CssSyntaxError, parse, type Rule } from "postcss";

/**
 * The CSS module source of an overlay stylesheet as theme CSS: its classes named `.{stylesheet}-{class}` (e.g.
 * `.GameScene-infoCard`), which the overlay resolves to the module's classes, and `:global()` unwrapped.
 */
export function fromModuleSource({
	source,
	stylesheet,
}: {
	source: string;
	stylesheet: string;
}) {
	const root = parse(source);

	root.walkRules((rule) => {
		if (isInKeyframes(rule)) return;

		rule.selector = rule.selector.replace(
			/:global\(([^)]*)\)|\.(-?[_a-zA-Z][\w-]*)/g,
			(_match, global: string | undefined, className: string | undefined) =>
				global ?? `.${stylesheet}-${className}`,
		);
	});
	root.walkAtRules((atRule) => {
		atRule.params = atRule.params.replace(/:global\(([^)]*)\)/g, "$1");
	});

	return root.toString();
}

/** Where CSS fails to parse and why. */
export interface CssError {
	line: number;
	reason: string;
}

/** Why the CSS doesn't parse, `null` when it does. */
export function syntaxError(css: string): CssError | null {
	try {
		parse(css);
		return null;
	} catch (error) {
		if (!(error instanceof CssSyntaxError)) throw error;

		return { line: error.line ?? 1, reason: error.reason };
	}
}

function isInKeyframes(rule: Rule) {
	return (
		rule.parent?.type === "atrule" &&
		/^(-\w+-)?keyframes$/i.test((rule.parent as AtRule).name)
	);
}
