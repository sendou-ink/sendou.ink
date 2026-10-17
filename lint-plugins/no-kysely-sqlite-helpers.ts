import type { Node, Rule } from "./ast";

const FORBIDDEN_SOURCE = ["kysely", "helpers", "sqlite"].join("/");

export const noKyselySqliteHelpers: Rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Disallow the kysely sqlite json helpers in favor of the forks in `~/utils/kysely.server`",
		},
		messages: {
			kyselySqliteHelpers:
				"Do not import from `kysely/helpers/sqlite`. Use the `jsonArrayFrom` / `jsonObjectFrom` / `jsonBuildObject` forks in `~/utils/kysely.server` instead; the kysely versions return nested JSON documents as strings.",
		},
		schema: [],
	},
	create(context) {
		return {
			Literal(node: Node) {
				if (node.value !== FORBIDDEN_SOURCE) return;
				// JSX attribute strings and enum member names are left alone
				if (
					node.parent.type === "JSXAttribute" ||
					node.parent.type === "TSEnumMember"
				) {
					return;
				}

				context.report({ node, messageId: "kyselySqliteHelpers" });
			},
		};
	},
};
