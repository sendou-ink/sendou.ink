import {
	isIdentifier,
	isPlainCall,
	isPlainMember,
	type Node,
	type RuleContext,
} from "./ast";

const CONNECTION_NAMES = ["db", "trx"];
const WRITE_METHODS = [
	"insertInto",
	"updateTable",
	"deleteFrom",
	"replaceInto",
];

/** Whether `node` starts a kysely write straight on the `db` / `trx` connection, e.g. `db.insertInto("User")`. */
export function isRawDbWrite(context: RuleContext, node: Node) {
	return (
		isPlainCall(context, node) &&
		isPlainMember(context, node.callee, WRITE_METHODS) &&
		CONNECTION_NAMES.some((name) =>
			isIdentifier(context, node.callee.object, name),
		)
	);
}
