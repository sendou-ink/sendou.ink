import {
	containsNode,
	isIdentifier,
	isPlainCall,
	isPlainMember,
	isStringLiteral,
	type Node,
	type Rule,
	type RuleContext,
} from "./ast";

const FUNCTION_TYPES = [
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
];

export const noRawActionForms: Rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require `_action` submissions to be type checked against the route's action schema",
		},
		messages: {
			untypedAction:
				'Untyped `_action`. For a fixed-field mutation use `<ActionButton schema={...} action="..." fields={{...}}>`; for a submit button of a real multi-input form pass `schema={...}` alongside `_action` so the literal is type checked against the route\'s schema.',
			actionName:
				'Do not submit `_action` via a hidden input or button name. Use `<ActionButton schema={...} action="..." fields={{...}}>`, or a `SubmitButton` with `schema` and `_action` inside a real multi-input form. If neither fits, suppress with `// eslint-disable-next-line sendou/no-raw-action-forms -- <reason>`.',
			fetcherSubmit:
				"Do not submit `_action` payloads with a raw fetcher.submit. Use the `useActionSubmit` hook so the action and fields are type checked against the route's schema. Suppress with `// eslint-disable-next-line sendou/no-raw-action-forms -- <reason>` if this cannot go through the hook.",
			formDataAppend:
				"Do not build `_action` FormData by hand. Use the `useActionSubmit` hook so the action and fields are type checked against the route's schema. Suppress with `// eslint-disable-next-line sendou/no-raw-action-forms -- <reason>` if this payload includes files.",
		},
		schema: [],
	},
	create(context) {
		return {
			JSXAttribute(node: Node) {
				if (
					isJsxAttributeNamed(node, "_action") &&
					!isWithinSchemaElement(node)
				) {
					context.report({ node, messageId: "untypedAction" });
				}

				if (
					isJsxAttributeNamed(node, "name") &&
					node.value?.type === "Literal" &&
					node.value.raw === '"_action"'
				) {
					context.report({ node, messageId: "actionName" });
				}
			},
			'AssignmentExpression[operator="="]'(node: Node) {
				if (isNameActionPair(context, node.left, node.right)) {
					context.report({ node, messageId: "actionName" });
				}
			},
			VariableDeclarator(node: Node) {
				if (!node.definite && isNameActionPair(context, node.id, node.init)) {
					context.report({ node, messageId: "actionName" });
				}
			},
			AssignmentPattern(node: Node) {
				if (
					FUNCTION_TYPES.includes(node.parent.type) &&
					node.parent.params.includes(node) &&
					isNameActionPair(context, node.left, node.right)
				) {
					context.report({ node, messageId: "actionName" });
				}
			},
			PropertyDefinition(node: Node) {
				const hasModifiers =
					node.static ||
					node.accessibility ||
					node.declare ||
					node.readonly ||
					node.optional ||
					node.definite ||
					node.typeAnnotation ||
					node.override ||
					node.decorators?.length > 0;

				if (
					!node.computed &&
					!hasModifiers &&
					isNameActionPair(context, node.key, node.value)
				) {
					context.report({ node, messageId: "actionName" });
				}
			},
			CallExpression(node: Node) {
				if (!isPlainCall(context, node) || node.arguments.length !== 2) return;

				if (
					isPlainMember(context, node.callee, ["submit"]) &&
					containsNode(context, node.arguments[0], isActionMember)
				) {
					context.report({ node, messageId: "fetcherSubmit" });
				}

				if (
					isPlainMember(context, node.callee, ["append"]) &&
					isStringLiteral(context, node.arguments[0], "_action")
				) {
					context.report({ node, messageId: "formDataAppend" });
				}
			},
		};

		function isWithinSchemaElement(attribute: Node) {
			for (let node = attribute.parent; node; node = node.parent) {
				if (
					node.type === "JSXOpeningElement" &&
					node.attributes.some((child: Node) =>
						containsNode(context, child, (candidate) =>
							isJsxAttributeNamed(candidate, "schema"),
						),
					)
				) {
					return true;
				}
			}

			return false;
		}
	},
};

function isJsxAttributeNamed(node: Node, name: string) {
	return (
		node.type === "JSXAttribute" &&
		node.name.type === "JSXIdentifier" &&
		node.name.name === name
	);
}

function isNameActionPair(context: RuleContext, target: Node, value: Node) {
	return (
		isIdentifier(context, target, "name") &&
		!target.typeAnnotation &&
		isStringLiteral(context, value, "_action")
	);
}

/** `_action: ...` as an object property, a labeled statement or a type member */
function isActionMember(node: Node) {
	const isActionKey =
		!node.computed &&
		node.key?.type === "Identifier" &&
		node.key.name === "_action";

	switch (node.type) {
		case "Property":
			return (
				isActionKey &&
				node.kind === "init" &&
				!node.method &&
				!node.shorthand &&
				node.parent.type !== "ObjectPattern"
			);
		case "TSPropertySignature":
			return isActionKey && !node.optional && !node.readonly;
		case "LabeledStatement":
			return node.label.name === "_action";
		default:
			return false;
	}
}
