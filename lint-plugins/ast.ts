// ESTree nodes as produced by typescript-estree, loosely typed
export type Node = any;

export interface RuleContext {
	sourceCode: {
		getTokenBefore(node: Node): { value: string } | null;
		getTokenAfter(node: Node): { value: string } | null;
		visitorKeys: Record<string, readonly string[]>;
	};
	report(descriptor: { node: Node; messageId: string }): void;
}

export interface Rule {
	meta: {
		type: "problem" | "suggestion";
		docs: { description: string };
		messages: Record<string, string>;
		schema: [];
	};
	create(context: RuleContext): Record<string, (node: Node) => void>;
}

/** Whether `node` is wrapped in grouping parentheses. Not reliable for a call's sole argument, whose own parens surround it. */
export function isParenthesized(context: RuleContext, node: Node) {
	return parenthesesCount(context, node) > 0;
}

/** How many layers of grouping parentheses wrap `node`. Not reliable for a call's sole argument. */
export function parenthesesCount(context: RuleContext, node: Node) {
	let count = 0;
	let before = context.sourceCode.getTokenBefore(node);
	let after = context.sourceCode.getTokenAfter(node);
	while (before?.value === "(" && after?.value === ")") {
		count++;
		before = context.sourceCode.getTokenBefore(before);
		after = context.sourceCode.getTokenAfter(after);
	}
	return count;
}

/** Whether `node` is the identifier `name`, unparenthesized. */
export function isIdentifier(context: RuleContext, node: Node, name: string) {
	return (
		node?.type === "Identifier" &&
		node.name === name &&
		!isParenthesized(context, node)
	);
}

/**
 * Whether `node` is an unparenthesized `object.property` access whose property is one of `propertyNames`,
 * without optional chaining, computed access or a non-null assertion in between.
 */
export function isPlainMember(
	context: RuleContext,
	node: Node,
	propertyNames: readonly string[],
) {
	return (
		node?.type === "MemberExpression" &&
		!node.computed &&
		!node.optional &&
		node.property.type === "Identifier" &&
		propertyNames.includes(node.property.name) &&
		!isParenthesized(context, node)
	);
}

/** Whether `node` is a call without optional chaining or type arguments whose callee is unparenthesized. */
export function isPlainCall(context: RuleContext, node: Node) {
	return (
		node?.type === "CallExpression" &&
		!node.optional &&
		!node.typeArguments &&
		!isParenthesized(context, node.callee)
	);
}

/** Whether `node` is an unparenthesized string literal with the given value. */
export function isStringLiteral(
	context: RuleContext,
	node: Node,
	value: string,
) {
	return (
		node?.type === "Literal" &&
		node.value === value &&
		!isParenthesized(context, node)
	);
}

/** Whether `node` or any node below it satisfies `predicate`. */
export function containsNode(
	context: RuleContext,
	node: Node,
	predicate: (node: Node) => boolean,
): boolean {
	if (predicate(node)) return true;

	for (const key of context.sourceCode.visitorKeys[node.type] ?? []) {
		const child = node[key];
		const children = Array.isArray(child) ? child : [child];
		for (const candidate of children) {
			if (
				candidate &&
				typeof candidate.type === "string" &&
				containsNode(context, candidate, predicate)
			) {
				return true;
			}
		}
	}

	return false;
}
