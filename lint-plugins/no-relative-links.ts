import {
	isPlainCall,
	isPlainMember,
	isStringLiteral,
	type Node,
	type Rule,
} from "./ast";

const ABSOLUTE_TARGET_REGEX = /^(?:\/|https?:|mailto:)/;

export const noRelativeLinks: Rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require absolute link targets, a relative one re-renders the link on every navigation",
		},
		messages: {
			relativeTarget:
				"Relative link target. Use an absolute path from a URL helper (`app/utils/urls.ts` or `<feature>-urls.ts`) so the link does not re-render on every navigation.",
			searchParamOnlyTarget:
				"Search-param-only link target, it resolves against the current location. Pass the page path as the first argument so the link does not re-render on every navigation. If the link must stay on whichever page is open, suppress with `// eslint-disable-next-line sendou/no-relative-links -- <reason>`.",
		},
		schema: [],
	},
	create(context) {
		return {
			JSXAttribute(node: Node) {
				if (
					node.name.type !== "JSXIdentifier" ||
					node.name.name !== "to" ||
					node.value?.type !== "Literal" ||
					!node.value.raw.startsWith('"')
				) {
					return;
				}

				const target = node.value.raw.slice(1, -1);
				if (!ABSOLUTE_TARGET_REGEX.test(target)) {
					context.report({ node, messageId: "relativeTarget" });
				}
			},
			CallExpression(node: Node) {
				if (
					isPlainCall(context, node) &&
					node.arguments.length === 2 &&
					isPlainMember(context, node.callee, ["href"]) &&
					isStringLiteral(context, node.arguments[0], "")
				) {
					context.report({ node, messageId: "searchParamOnlyTarget" });
				}
			},
		};
	},
};
