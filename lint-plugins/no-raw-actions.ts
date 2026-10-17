import {
	isIdentifier,
	isParenthesized,
	isPlainCall,
	isPlainMember,
	type Node,
	type Rule,
	type RuleContext,
} from "./ast";

const ACTION_NAME_REGEX = /^(?:action|[a-z][A-Za-z0-9]*Action)$/;
const BODY_READ_METHODS = ["formData", "json", "text"];

export const noRawActions: Rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require route actions to be defined with `defineAction`, which parses the request body",
		},
		messages: {
			rawAction:
				"Define route actions with `defineAction` from `~/form/define-action.server`. See docs/site/src/content/docs/dev/forms.mdx.",
			rawBodyRead:
				"Do not read the request body directly. Declare a `body` schema in `defineAction`. See docs/site/src/content/docs/dev/forms.mdx.",
		},
		schema: [],
	},
	create(context) {
		return {
			ExportNamedDeclaration(node: Node) {
				const { declaration } = node;

				if (
					declaration?.type === "VariableDeclaration" &&
					declaration.kind === "const" &&
					!declaration.declare &&
					declaration.declarations.length === 1
				) {
					const [declarator] = declaration.declarations;
					if (
						declarator.id.type === "Identifier" &&
						ACTION_NAME_REGEX.test(declarator.id.name) &&
						declarator.init &&
						!isDefineActionCall(context, declarator.init)
					) {
						context.report({ node, messageId: "rawAction" });
					}
				}

				if (
					declaration?.type === "FunctionDeclaration" &&
					!declaration.generator &&
					!declaration.typeParameters &&
					!declaration.returnType &&
					ACTION_NAME_REGEX.test(declaration.id.name)
				) {
					context.report({ node, messageId: "rawAction" });
				}
			},
			CallExpression(node: Node) {
				if (
					isPlainCall(context, node) &&
					node.arguments.length === 0 &&
					isPlainMember(context, node.callee, BODY_READ_METHODS) &&
					isRequest(context, node.callee.object)
				) {
					context.report({ node, messageId: "rawBodyRead" });
				}
			},
		};
	},
};

function isDefineActionCall(context: RuleContext, node: Node) {
	return (
		isPlainCall(context, node) &&
		isIdentifier(context, node.callee, "defineAction") &&
		!isParenthesized(context, node)
	);
}

function isRequest(context: RuleContext, node: Node) {
	return (
		isIdentifier(context, node, "request") ||
		isPlainMember(context, node, ["request"])
	);
}
