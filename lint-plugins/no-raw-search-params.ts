import {
	isIdentifier,
	isPlainCall,
	isPlainMember,
	type Node,
	type Rule,
} from "./ast";

const READ_METHODS = ["get", "getAll", "has"];

export const noRawSearchParams: Rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require search params to go through `app/modules/search-params` definitions",
		},
		messages: {
			useSearchParams:
				"Do not use raw `useSearchParams`. Declare the params in a `<feature>-search-params.ts` definition and read them with `useSearchParamsTyped`. See docs/site/src/content/docs/dev/search-params.mdx.",
			searchParamsRead:
				"Do not read search params off a URL directly. Declare them in a `<feature>-search-params.ts` definition and read them with `definition.parse(request)`. If this is not a sendou.ink URL (an outgoing API call, or a URL pasted by a user), suppress with `// eslint-disable-next-line sendou/no-raw-search-params -- <reason>`.",
		},
		schema: [],
	},
	create(context) {
		return {
			CallExpression(node: Node) {
				if (!isPlainCall(context, node)) return;

				if (
					node.arguments.length === 0 &&
					isIdentifier(context, node.callee, "useSearchParams")
				) {
					context.report({ node, messageId: "useSearchParams" });
				}

				if (
					isPlainMember(context, node.callee, READ_METHODS) &&
					isPlainMember(context, node.callee.object, ["searchParams"])
				) {
					context.report({ node, messageId: "searchParamsRead" });
				}
			},
		};
	},
};
