import type { Node, Rule } from "./ast";
import { isRawDbWrite } from "./raw-db-writes";

export const noRawDbWritesInDevSeed: Rule = {
	meta: {
		type: "problem",
		docs: {
			description:
				"Require the dev seed to compose factories instead of writing directly",
		},
		messages: {
			rawDbWrite:
				"The dev seed must not write to the database directly. Compose factories from `app/db/seed/factories`; if none fits, add one wrapping the repository write.",
		},
		schema: [],
	},
	create(context) {
		return {
			CallExpression(node: Node) {
				if (isRawDbWrite(context, node)) {
					context.report({ node, messageId: "rawDbWrite" });
				}
			},
		};
	},
};
