import { type Comment, type Node, parseSync, visitorKeys } from "oxc-parser";

export type MutationOperator =
	| "comparison"
	| "logical"
	| "arithmetic"
	| "negation"
	| "condition"
	| "boolean"
	| "number"
	| "call";

export interface Mutant {
	id: number;
	operator: MutationOperator;
	/** How the change reads in a report, e.g. "`<` → `<=`". */
	change: string;
	start: number;
	end: number;
	replacement: string;
	/** 1-based. */
	line: number;
	/** 1-based. */
	column: number;
	/** Innermost function the mutant sits in, `MODULE_SCOPE_ID` outside of any. */
	scopeId: number;
	/** Nearest named function, what reports group by. */
	functionName: string;
	functionLine: number;
	/** Reason of the `mutation-ignore` comment covering the mutant. */
	ignoredReason: string | null;
}

interface FunctionScope {
	id: number;
	bodyStart: number;
	bodyEnd: number;
	hasBlockBody: boolean;
}

export interface MutationPlan {
	mutants: Mutant[];
	scopes: FunctionScope[];
}

export const MODULE_SCOPE_ID = 0;
export const MODULE_FUNCTION_NAME = "(module level)";

const IGNORE_COMMENT = "mutation-ignore";

/** Calls that only guard or report, a mutant in them changes nothing a test should assert on. */
const IGNORED_CALLEES = new Set(["invariant", "assertUnreachable"]);
const IGNORED_CALLEE_OBJECTS = new Set(["logger", "console"]);

const COMPARISON_SWAPS = new Map([
	["<", ["<=", ">="]],
	["<=", ["<", ">"]],
	[">", [">=", "<="]],
	[">=", [">", "<"]],
	["===", ["!=="]],
	["!==", ["==="]],
	["==", ["!="]],
	["!=", ["=="]],
]);

const ARITHMETIC_SWAPS = new Map([
	["+", "-"],
	["-", "+"],
	["*", "/"],
	["/", "*"],
	["%", "*"],
]);

const LOGICAL_SWAPS = new Map([
	["&&", "||"],
	["||", "&&"],
]);

const ASSIGNMENT_SWAPS = new Map([
	["+=", "-="],
	["-=", "+="],
	["*=", "/="],
	["/=", "*="],
]);

/** `as` and friends wrap a runtime expression, every other `TS*` node is a type position. */
const TS_EXPRESSION_WRAPPERS = new Set([
	"TSAsExpression",
	"TSSatisfiesExpression",
	"TSNonNullExpression",
	"TSTypeAssertion",
	"TSInstantiationExpression",
]);

const FUNCTION_TYPES = new Set([
	"FunctionDeclaration",
	"FunctionExpression",
	"ArrowFunctionExpression",
]);

interface WalkContext {
	scopeId: number;
	functionName: string;
	functionLine: number;
	className: string | null;
	ignoredReason: string | null;
	isInModuleConstant: boolean;
}

/**
 * Every mutant of a TypeScript source: one small change each that a test suite protecting the
 * behaviour should notice. Type positions, imports, string concatenation and guard/log calls
 * are left alone, and so is known noise (`?? 0` style defaults, nudges to the numbers of
 * module level constants: tuning values and data tables). A `// mutation-ignore: reason` comment
 * marks the mutants of the statement below it as ignored.
 */
export function planMutations(filePath: string, source: string): MutationPlan {
	const parsed = parseSync(filePath, source, { preserveParens: false });
	if (parsed.errors.length > 0) {
		throw new Error(`${filePath} does not parse: ${parsed.errors[0].message}`);
	}

	const lineStarts = lineStartsOf(source);
	const ignoreTargets = ignoreTargetsOf(source, parsed.comments, lineStarts);
	const isInComment = commentMask(source, parsed.comments);
	const moduleLevelDeclarations = new Set<Node>(
		parsed.program.body.map((statement) =>
			statement.type === "ExportNamedDeclaration" && statement.declaration
				? statement.declaration
				: statement,
		),
	);
	const mutants: Mutant[] = [];
	const scopes: FunctionScope[] = [];

	const add = (
		ctx: WalkContext,
		mutant: Pick<
			Mutant,
			"operator" | "change" | "start" | "end" | "replacement"
		>,
	) => {
		const line = lineAt(lineStarts, mutant.start);
		mutants.push({
			...mutant,
			id: mutants.length,
			line,
			column: mutant.start - lineStarts[line - 1] + 1,
			scopeId: ctx.scopeId,
			functionName: ctx.functionName,
			functionLine: ctx.functionLine,
			ignoredReason: ctx.ignoredReason,
		});
	};

	const operatorRange = (left: Node, right: Node, operator: string) => {
		for (let i = left.end; i <= right.start - operator.length; i++) {
			if (!isInComment[i] && source.startsWith(operator, i)) {
				return { start: i, end: i + operator.length };
			}
		}
		throw new Error(`Operator ${operator} not found at offset ${left.end}`);
	};

	const visitChildren = (node: Node, ctx: WalkContext) => {
		for (const key of visitorKeys[node.type] ?? []) {
			const child = (node as any)[key];
			if (Array.isArray(child)) {
				for (const item of child) {
					if (item && typeof item.type === "string") visit(item, ctx);
				}
			} else if (child && typeof child.type === "string") {
				visit(child, ctx);
			}
		}
	};

	const visit = (node: Node, parentCtx: WalkContext, nameHint?: string) => {
		let ctx = parentCtx;

		const ignoredReason =
			node.type === "Program" ? undefined : ignoreTargets.get(node.start);
		if (ignoredReason !== undefined) {
			ignoreTargets.delete(node.start);
			ctx = { ...ctx, ignoredReason };
		}

		if (node.type.startsWith("TS")) {
			if (TS_EXPRESSION_WRAPPERS.has(node.type)) {
				visit((node as any).expression, ctx, nameHint);
			}
			return;
		}

		if (FUNCTION_TYPES.has(node.type)) {
			const fn = node as any;
			if (!fn.body) return;

			const name: string | undefined = fn.id?.name ?? nameHint;
			const scope: FunctionScope = {
				id: scopes.length + 1,
				bodyStart: fn.body.start,
				bodyEnd: fn.body.end,
				hasBlockBody: fn.body.type === "BlockStatement",
			};
			scopes.push(scope);

			visitChildren(node, {
				...ctx,
				scopeId: scope.id,
				functionName: name ?? ctx.functionName,
				functionLine: name ? lineAt(lineStarts, node.start) : ctx.functionLine,
				isInModuleConstant: false,
			});
			return;
		}

		switch (node.type) {
			case "ImportDeclaration":
			case "ExportAllDeclaration":
			case "ThrowStatement":
				return;
			case "ClassDeclaration":
			case "ClassExpression": {
				visitChildren(node, {
					...ctx,
					className: node.id?.name ?? nameHint ?? null,
				});
				return;
			}
			case "MethodDefinition":
			case "PropertyDefinition":
			case "Property": {
				if (node.computed) visit(node.key, ctx);
				if (!node.value) return;

				const keyName = propertyKeyName(node.key);
				const isClassMember = node.type !== "Property";
				visit(
					node.value,
					ctx,
					keyName && isClassMember && ctx.className
						? `${ctx.className}.${keyName}`
						: (keyName ?? undefined),
				);
				return;
			}
			case "VariableDeclaration": {
				for (const declarator of node.declarations) {
					visit(declarator.id, ctx);
					if (!declarator.init) continue;

					const name =
						declarator.id.type === "Identifier" ? declarator.id.name : null;
					visit(
						declarator.init,
						{
							...ctx,
							// tuning values and data tables
							isInModuleConstant: moduleLevelDeclarations.has(node),
						},
						name ?? undefined,
					);
				}
				return;
			}
			case "CallExpression": {
				if (isIgnoredCallee(node.callee)) return;
				break;
			}
			case "ExpressionStatement": {
				const call = droppableCall(node.expression);
				if (call) {
					add(ctx, {
						operator: "call",
						change: `dropped call \`${calleeText(source, call)}(…)\``,
						start: node.start,
						end: node.end,
						replacement: ";",
					});
				}
				break;
			}
			case "IfStatement":
			case "ConditionalExpression": {
				if (isBooleanLiteral(node.test)) break;

				const subject = node.type === "IfStatement" ? "`if`" : "ternary";
				for (const forced of ["true", "false"]) {
					add(ctx, {
						operator: "condition",
						change: `${subject} condition → \`${forced}\``,
						start: node.test.start,
						end: node.test.end,
						replacement: forced,
					});
				}
				break;
			}
			case "BinaryExpression": {
				const comparisonSwaps = COMPARISON_SWAPS.get(node.operator);
				const arithmeticSwap = isStringConcatenation(node)
					? undefined
					: ARITHMETIC_SWAPS.get(node.operator);
				for (const swap of comparisonSwaps ?? [arithmeticSwap]) {
					if (!swap) continue;

					add(ctx, {
						operator: comparisonSwaps ? "comparison" : "arithmetic",
						change: `\`${node.operator}\` → \`${swap}\``,
						...operatorRange(node.left, node.right, node.operator),
						replacement: swap,
					});
				}
				break;
			}
			case "LogicalExpression": {
				if (node.operator === "??") {
					visit(node.left, ctx);
					// a default is rarely worth a test of its own
					if (!isLiteralDefault(node.right)) visit(node.right, ctx);
					return;
				}

				const swap = LOGICAL_SWAPS.get(node.operator)!;
				add(ctx, {
					operator: "logical",
					change: `\`${node.operator}\` → \`${swap}\``,
					...operatorRange(node.left, node.right, node.operator),
					replacement: swap,
				});
				break;
			}
			case "AssignmentExpression": {
				const swap = ASSIGNMENT_SWAPS.get(node.operator);
				if (!swap || (node.operator === "+=" && isStringLike(node.right))) {
					break;
				}

				add(ctx, {
					operator: "arithmetic",
					change: `\`${node.operator}\` → \`${swap}\``,
					...operatorRange(node.left, node.right, node.operator),
					replacement: swap,
				});
				break;
			}
			case "UnaryExpression": {
				if (node.operator !== "!") break;

				add(ctx, {
					operator: "negation",
					change: "dropped `!`",
					start: node.start,
					end: node.start + 1,
					replacement: "",
				});
				// `!!x` is one coercion, dropping either `!` gives the same mutant
				if (
					node.argument.type === "UnaryExpression" &&
					node.argument.operator === "!"
				) {
					visit(node.argument.argument, ctx);
					return;
				}
				break;
			}
			case "Literal": {
				if (typeof node.value === "boolean") {
					add(ctx, {
						operator: "boolean",
						change: `\`${node.value}\` → \`${!node.value}\``,
						start: node.start,
						end: node.end,
						replacement: String(!node.value),
					});
				} else if (typeof node.value === "number" && !ctx.isInModuleConstant) {
					const nudged = String(node.value + 1);
					add(ctx, {
						operator: "number",
						change: `\`${source.slice(node.start, node.end)}\` → \`${nudged}\``,
						start: node.start,
						end: node.end,
						replacement: nudged,
					});
				}
				return;
			}
		}

		visitChildren(node, ctx);
	};

	visit(parsed.program, {
		scopeId: MODULE_SCOPE_ID,
		functionName: MODULE_FUNCTION_NAME,
		functionLine: 1,
		className: null,
		ignoredReason: null,
		isInModuleConstant: false,
	});

	const [danglingIgnore] = ignoreTargets.keys();
	if (danglingIgnore !== undefined) {
		throw new Error(
			`${filePath}:${lineAt(lineStarts, danglingIgnore)} a ${IGNORE_COMMENT} comment has to sit directly above a statement, declaration or property`,
		);
	}

	return { mutants, scopes };
}

/** The source with one mutant applied. */
export function applyMutant(
	source: string,
	mutant: Pick<Mutant, "start" | "end" | "replacement">,
) {
	return (
		source.slice(0, mutant.start) +
		mutant.replacement +
		source.slice(mutant.end)
	);
}

/**
 * The source with a `globalThis.__mutationHit(fileIndex, scopeId)` call at the start of every
 * function holding a mutant and one for the module itself, which is how the baseline run learns
 * the test files able to notice each mutant. Line numbers are kept.
 */
export function instrumentScopes(
	source: string,
	plan: MutationPlan,
	fileIndex: number,
) {
	const hit = (scopeId: number) =>
		`globalThis.__mutationHit?.(${fileIndex}, ${scopeId})`;
	const mutatedScopeIds = new Set(
		plan.mutants
			.filter((mutant) => mutant.ignoredReason === null)
			.map((mutant) => mutant.scopeId),
	);

	const insertions: Array<{ offset: number; text: string }> = [];
	for (const scope of plan.scopes) {
		if (!mutatedScopeIds.has(scope.id)) continue;

		if (scope.hasBlockBody) {
			insertions.push({
				offset: scope.bodyStart + 1,
				text: `${hit(scope.id)};`,
			});
		} else {
			insertions.push({ offset: scope.bodyStart, text: `(${hit(scope.id)}, ` });
			insertions.push({ offset: scope.bodyEnd, text: ")" });
		}
	}

	let result = source;
	for (const insertion of insertions.sort((a, b) => b.offset - a.offset)) {
		result =
			result.slice(0, insertion.offset) +
			insertion.text +
			result.slice(insertion.offset);
	}

	return `${result}\n${hit(MODULE_SCOPE_ID)};\n`;
}

/** 1-based line of every line start offset, for `lineAt`. */
export function lineStartsOf(source: string) {
	const lineStarts = [0];
	for (let i = 0; i < source.length; i++) {
		if (source[i] === "\n") lineStarts.push(i + 1);
	}

	return lineStarts;
}

/** 1-based line of a source offset. */
export function lineAt(lineStarts: number[], offset: number) {
	let low = 0;
	let high = lineStarts.length - 1;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (lineStarts[mid] <= offset) low = mid;
		else high = mid - 1;
	}

	return low + 1;
}

/** Maps the offset of the node each ignore comment sits above to the comment's reason. */
function ignoreTargetsOf(
	source: string,
	comments: Comment[],
	lineStarts: number[],
) {
	const targets = new Map<number, string>();

	for (const [index, comment] of comments.entries()) {
		const text = comment.value.trim();
		if (!text.startsWith(IGNORE_COMMENT)) continue;

		const reason = text.slice(IGNORE_COMMENT.length).replace(/^:/, "").trim();
		if (!reason) {
			throw new Error(
				`A ${IGNORE_COMMENT} comment needs a reason (line ${lineAt(lineStarts, comment.start)}): // ${IGNORE_COMMENT}: why the mutants below are not worth a test`,
			);
		}

		let offset = comment.end;
		let nextComment = index + 1;
		while (offset < source.length) {
			if (/\s/.test(source[offset])) offset++;
			else if (comments[nextComment]?.start === offset) {
				offset = comments[nextComment].end;
				nextComment++;
			} else break;
		}
		targets.set(offset, reason);
	}

	return targets;
}

function commentMask(source: string, comments: Comment[]) {
	const mask = new Uint8Array(source.length);
	for (const comment of comments) mask.fill(1, comment.start, comment.end);

	return mask;
}

function propertyKeyName(key: Node) {
	if (key.type === "Identifier") return key.name;
	if (key.type === "Literal" && typeof key.value === "string") return key.value;

	return null;
}

function isIgnoredCallee(callee: Node) {
	if (callee.type === "Identifier") return IGNORED_CALLEES.has(callee.name);

	return (
		callee.type === "MemberExpression" &&
		callee.object.type === "Identifier" &&
		IGNORED_CALLEE_OBJECTS.has(callee.object.name)
	);
}

/** The call an expression statement consists of, if dropping the statement is a mutant. */
function droppableCall(expression: Node) {
	let call = expression;
	if (call.type === "AwaitExpression") call = call.argument;
	if (call.type === "ChainExpression") call = call.expression;

	if (call.type !== "CallExpression") return null;
	if (call.callee.type === "Super" || isIgnoredCallee(call.callee)) return null;

	return call;
}

function calleeText(source: string, call: Node & { type: "CallExpression" }) {
	const text = source
		.slice(call.callee.start, call.callee.end)
		.replace(/\s+/g, " ");

	return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function isBooleanLiteral(node: Node) {
	return node.type === "Literal" && typeof node.value === "boolean";
}

function isLiteralDefault(node: Node): boolean {
	if (node.type === "Literal" || node.type === "TemplateLiteral") return true;
	if (node.type === "UnaryExpression") return isLiteralDefault(node.argument);
	if (node.type === "ArrayExpression") return node.elements.length === 0;
	if (node.type === "ObjectExpression") return node.properties.length === 0;

	return false;
}

function isStringConcatenation(node: Node & { type: "BinaryExpression" }) {
	return (
		node.operator === "+" &&
		(isStringLike(node.left) || isStringLike(node.right))
	);
}

function isStringLike(node: Node): boolean {
	if (node.type === "TemplateLiteral") return true;
	if (node.type === "Literal") return typeof node.value === "string";
	if (node.type === "BinaryExpression") return isStringConcatenation(node);
	if (TS_EXPRESSION_WRAPPERS.has(node.type)) {
		return isStringLike((node as any).expression);
	}

	return false;
}
