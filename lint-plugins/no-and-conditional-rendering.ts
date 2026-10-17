import { isParenthesized, type Node, parenthesesCount, type Rule } from "./ast";

const JSX_TAG_TYPES = ["JSXElement", "JSXFragment"];

export const noAndConditionalRendering: Rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow `&&` for conditional rendering, a falsy left side renders itself",
		},
		messages: {
			andConditionalRendering:
				"Do not use `&&` for conditional rendering: a falsy left side that is not `null`/`undefined`/`false` (a `0` count, an empty string, `NaN`) renders itself. Use a ternary instead: `cond ? <X /> : null`.",
		},
		schema: [],
	},
	create(context) {
		return {
			'LogicalExpression[operator="&&"]'(node: Node) {
				const rendersJsxTag =
					JSX_TAG_TYPES.includes(node.right.type) &&
					parenthesesCount(context, node.right) <= 1;

				if (rendersJsxTag || isJsxChild(node)) {
					context.report({ node, messageId: "andConditionalRendering" });
				}
			},
		};

		function isJsxChild(node: Node) {
			return (
				node.parent.type === "JSXExpressionContainer" &&
				JSX_TAG_TYPES.includes(node.parent.parent.type) &&
				!isParenthesized(context, node)
			);
		}
	},
};
