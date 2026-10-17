import type { Node, Rule } from "./ast";
import { isRawDbWrite } from "./raw-db-writes";

export const noRawDbWritesInTests: Rule = {
	meta: {
		type: "problem",
		docs: {
			description: "Require tests to arrange database state through factories",
		},
		messages: {
			rawDbWrite:
				"Tests must not write to the database directly. Use a factory from `app/db/seed/factories`, or a repository write function if the test is about that write. If no production write reaches this state, keep the raw write and suppress with `// eslint-disable-next-line sendou/no-raw-db-writes-in-tests -- <reason>`.",
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
