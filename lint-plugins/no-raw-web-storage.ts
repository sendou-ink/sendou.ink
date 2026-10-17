import type { Node, Rule } from "./ast";

const STORAGE_NAMES = ["localStorage", "sessionStorage"];

export const noRawWebStorage: Rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require web storage access to go through `app/modules/persisted-state`",
		},
		messages: {
			rawWebStorage:
				"Do not use web storage directly. Declare the value with `PersistedState.define` / `defineMap` (app/modules/persisted-state) and read it with `usePersistedState` / `PersistedState.read`. Suppress with `// eslint-disable-next-line sendou/no-raw-web-storage -- <reason>` if it can't go through the module.",
		},
		schema: [],
	},
	create(context) {
		// a shorthand property or specifier has two identifier nodes spanning the same source
		const reportedOffsets = new Set<number>();

		return {
			"Identifier, JSXIdentifier"(node: Node) {
				if (!STORAGE_NAMES.includes(node.name) || isUnmatchedPosition(node)) {
					return;
				}
				if (reportedOffsets.has(node.range[0])) return;
				reportedOffsets.add(node.range[0]);

				context.report({ node, messageId: "rawWebStorage" });
			},
		};
	},
};

/** Name positions that do not refer to the global. */
function isUnmatchedPosition(node: Node) {
	const { parent } = node;

	switch (parent.type) {
		case "ImportSpecifier":
		case "ExportSpecifier":
			return parent.local !== node;
		case "ExportAllDeclaration":
			return parent.exported === node;
		case "LabeledStatement":
		case "BreakStatement":
		case "ContinueStatement":
			return parent.label === node;
		case "JSXMemberExpression":
			return parent.object === node;
		case "TSTypeAliasDeclaration":
		case "TSInterfaceDeclaration":
		case "TSModuleDeclaration":
		case "TSEnumMember":
			return parent.id === node;
		case "TSTypeParameter":
			return parent.name === node;
		default:
			return false;
	}
}
