import type {
	Argument,
	ArrowFunctionExpression,
	CallExpression,
	Expression,
	Function as FunctionNode,
	Node,
	Statement,
} from "oxc-parser";
import {
	commentsBetween,
	jsDocOf,
	lineOf,
	type ParsedFile,
	parseFile,
	textOf,
} from "./ast.ts";
import {
	type FormSchema,
	formHelpersSchemaName,
	formSchemaOf,
} from "./forms.ts";
import { escapeHtml, highlight } from "./highlight.ts";
import { KNOWN_USERS } from "./known-users.ts";
import {
	type PageObjectIndex,
	type SourceRef,
	sourceRef,
} from "./page-objects.ts";

const LOGGED_OUT: Actor = {
	key: "logged-out",
	label: "Logged out",
	color: "#94a3b8",
};

/** Colours of the users a test creates itself, given out per test in order of appearance. */
const OTHER_USER_COLORS = [
	"#ec4899",
	"#06b6d4",
	"#84cc16",
	"#ef4444",
	"#a855f7",
];

/** Setup calls that don't say anything about the behaviour under test. */
const OMITTED_HELPERS = new Set([
	"setTimezoneCookie",
	"expectIsHydrated",
	"waitForNavigationRendered",
	"waitForDropToSettle",
]);

const LOCATOR_ACTIONS: Record<string, string> = {
	click: "Click",
	dblclick: "Double click",
	hover: "Hover",
	focus: "Focus",
	check: "Check",
	uncheck: "Uncheck",
	fill: "Fill",
	press: "Press",
	selectOption: "Select",
	setInputFiles: "Upload to",
};

const LOCATOR_QUERIES: Record<string, string> = {
	getByTestId: "element",
	getByText: "text",
	getByLabel: "field",
	getByPlaceholder: "field",
	getByTitle: "element titled",
	getByAltText: "image",
};

const MATCHERS: Record<
	string,
	(args: string[]) => readonly [positive: string, negated: string]
> = {
	toBeVisible: () => ["is visible", "is not visible"],
	toBeHidden: () => ["is hidden", "is not hidden"],
	toBeChecked: () => ["is checked", "is not checked"],
	toBeEnabled: () => ["is enabled", "is not enabled"],
	toBeDisabled: () => ["is disabled", "is not disabled"],
	toBeEmpty: () => ["is empty", "is not empty"],
	toBeFocused: () => ["is focused", "is not focused"],
	toBeAttached: () => ["is in the page", "is not in the page"],
	toBeTruthy: () => ["is truthy", "is falsy"],
	toBeNull: () => ["is null", "is not null"],
	toHaveCount: ([count]) => [`count is ${count}`, `count is not ${count}`],
	toContainText: ([text]) => [`contains ${text}`, `does not contain ${text}`],
	toHaveText: ([text]) => [`reads ${text}`, `does not read ${text}`],
	toHaveURL: ([url]) => [`URL is ${url}`, `URL is not ${url}`],
	toHaveTitle: ([title]) => [`title is ${title}`, `title is not ${title}`],
	toHaveValue: ([expected]) => [
		`has value ${expected}`,
		`does not have value ${expected}`,
	],
	toHaveAttribute: ([attribute, expected]) =>
		expected
			? [
					`has ${attribute} = ${expected}`,
					`does not have ${attribute} = ${expected}`,
				]
			: [`has ${attribute}`, `does not have ${attribute}`],
	toHaveClass: ([className]) => [
		`has class ${className}`,
		`does not have class ${className}`,
	],
	toBe: ([expected]) => [`is ${expected}`, `is not ${expected}`],
	toEqual: ([expected]) => [`equals ${expected}`, `does not equal ${expected}`],
	toStrictEqual: ([expected]) => [
		`equals ${expected}`,
		`does not equal ${expected}`,
	],
	toContain: ([expected]) => [
		`contains ${expected}`,
		`does not contain ${expected}`,
	],
	toHaveLength: ([length]) => [
		`has ${length} items`,
		`does not have ${length} items`,
	],
	toBeGreaterThan: ([expected]) => [
		`is more than ${expected}`,
		`is not more than ${expected}`,
	],
	toBeLessThan: ([expected]) => [
		`is less than ${expected}`,
		`is not less than ${expected}`,
	],
};

export type Phase = "arrange" | "act" | "assert";

export interface Actor {
	key: string;
	label: string;
	color: string;
}

export interface Step {
	/** Null for a value being named, it reads as part of whichever phase surrounds it. */
	phase: Phase | null;
	isNaming: boolean;
	html: string;
	code: string;
	/** Spec line the step's statement starts on. */
	line: number;
	endLine: number;
	notes: string[];
	/** Page object the step works on, a change of it is a divider. */
	pageClass: string | null;
	children: Step[];
	/** Set on `impersonate`, every step from it on is done as this user. */
	actor: Actor | null;
	/** Title of a `test.step`, its statements are the children. */
	testStep: string | null;
}

export interface Divider {
	kind: "divider";
	/** Label HTML, hovering it shows the page object. */
	html: string;
	/** Spec line of the divider's first step, it also names its screenshot. */
	line: number;
	plainLabel: string;
}

export interface Run {
	kind: "run";
	phase: Phase;
	steps: Step[];
}

export interface Segment {
	/** Null for the setup done before anyone is logged in. */
	actor: Actor | null;
	items: Array<Divider | Run>;
}

/** A `test.step` of a test, or what the test does outside of its steps. */
export interface Chapter {
	/** Null for what is done outside of a `test.step`. */
	title: string | null;
	/** Spec line the chapter starts on, it also names its screenshot. */
	line: number;
	endLine: number;
	segments: Segment[];
}

export interface TestDoc {
	name: string;
	/** JSDoc above the test, the rule or intent its steps establish. */
	doc: string | null;
	/** Describe names and the test name, as Playwright reports them. */
	titlePath: string[];
	line: number;
	endLine: number;
	modifier: string | null;
	source: string;
	actors: Actor[];
	chapters: Chapter[];
}

export interface TestGroup {
	name: string | null;
	/** Names of the `describe`s the group is nested in, itself included. */
	titlePath: string[];
	/** JSDoc above the `describe`. */
	doc: string | null;
	line: number;
	/** `test.use` options of the group, e.g. a viewport. */
	options: string | null;
	tests: TestDoc[];
}

export interface SpecDoc {
	path: string;
	groups: TestGroup[];
	/** What hovering a `data-ref` of the spec's steps shows, by ref id. */
	refs: Map<string, SourceRef>;
}

interface HookState {
	/** Who `beforeEach` logged in as, the tests start as them. */
	actor: Actor | null;
	variableClasses: Map<string, string>;
}

interface Context {
	file: ParsedFile;
	pageObjects: PageObjectIndex;
	constants: Map<string, string>;
	localHelpers: Map<string, SourceRef>;
	localFunctions: Map<string, FunctionNode>;
	variableClasses: Map<string, string>;
	/** `const form = createFormHelpers(page, schema)` variables → the schema's fields. */
	formVariables: Map<string, FormSchema>;
	refs: Map<string, SourceRef>;
}

/** An e2e spec as readable steps: who does what on which page, and what is then expected. */
export function documentSpec(specPath: string, pageObjects: PageObjectIndex) {
	const file = parseFile(specPath);
	const context: Context = {
		file,
		pageObjects,
		constants: topLevelConstants(file),
		localHelpers: localHelpers(file),
		localFunctions: new Map(
			file.program.body.flatMap((statement) =>
				statement.type === "FunctionDeclaration" && statement.id
					? [[statement.id.name, statement] as const]
					: [],
			),
		),
		variableClasses: new Map(),
		formVariables: new Map(),
		refs: new Map(),
	};

	const groups: TestGroup[] = [];
	const ungrouped: TestGroup = {
		name: null,
		titlePath: [],
		doc: null,
		line: 1,
		options: null,
		tests: [],
	};
	collectTests(file.program.body, null, context, groups, ungrouped);

	return {
		path: specPath,
		groups: ungrouped.tests.length > 0 ? [ungrouped, ...groups] : groups,
		refs: context.refs,
	} satisfies SpecDoc;
}

function collectTests(
	statements: Statement[],
	groupName: string | null,
	context: Context,
	groups: TestGroup[],
	group: TestGroup,
	inheritedFromHooks: HookState = { actor: null, variableClasses: new Map() },
) {
	const fromHooks: HookState = {
		actor: inheritedFromHooks.actor,
		variableClasses: new Map(inheritedFromHooks.variableClasses),
	};

	for (const statement of expandTestStatements(statements, context)) {
		if (statement.type !== "ExpressionStatement") continue;
		const call = statement.expression;
		if (call.type !== "CallExpression") continue;

		const calleePath = memberPath(call.callee);
		if (calleePath[0] !== "test") continue;

		if (calleePath[1] === "use" && call.arguments[0]) {
			group.options = textOf(context.file, call.arguments[0]).replace(
				/\s*\n\s*/g,
				" ",
			);
			continue;
		}

		const name = testName(context.file, call.arguments[0]);
		const callback = call.arguments.find(
			(arg): arg is ArrowFunctionExpression | FunctionNode =>
				arg.type === "ArrowFunctionExpression" ||
				arg.type === "FunctionExpression",
		);
		if (callback?.body?.type !== "BlockStatement") continue;

		if (calleePath[1] === "describe") {
			const fullName = [groupName, name].filter(Boolean).join(" › ");
			const nested: TestGroup = {
				name: fullName,
				titlePath: [...group.titlePath, name ?? ""],
				doc: jsDocOf(context.file, statement.start)?.description ?? null,
				line: lineOf(context.file, call.start),
				options: group.options,
				tests: [],
			};
			groups.push(nested);
			collectTests(
				callback.body.body,
				fullName,
				context,
				groups,
				nested,
				fromHooks,
			);
			continue;
		}

		const isHook =
			calleePath[1]?.startsWith("before") || calleePath[1]?.startsWith("after");
		if (
			calleePath.length > 1 &&
			!isHook &&
			!["only", "skip", "fixme", "fail"].includes(calleePath[1])
		) {
			continue;
		}

		context.variableClasses = new Map(fromHooks.variableClasses);
		const steps = narrateStatements(
			callback.body.body,
			context,
			callback.body.start,
		);
		const startingActor = isHook ? null : fromHooks.actor;

		const testTitle = isHook
			? humanize(calleePath[1])
			: (name ?? "(unnamed test)");
		group.tests.push({
			name: testTitle,
			doc: jsDocOf(context.file, statement.start)?.description ?? null,
			titlePath: [...group.titlePath, testTitle],
			line: lineOf(context.file, call.start),
			endLine: lineOf(context.file, call.end),
			modifier: isHook ? "hook" : (calleePath[1] ?? null),
			source: textOf(context.file, call),
			...colorActors(
				actorsOf(steps, startingActor),
				chaptersOf(steps, context, startingActor),
			),
		});

		if (calleePath[1] === "beforeEach") {
			fromHooks.actor = actorsOf(steps, null).at(-1) ?? fromHooks.actor;
			fromHooks.variableClasses = new Map(context.variableClasses);
		}
	}
}

/** Tests declared by a loop or by a local function called in a `describe` read as if written there. */
function expandTestStatements(
	statements: Statement[],
	context: Context,
	depth = 0,
): Statement[] {
	if (depth > 3) return statements;

	return statements.flatMap((statement) => {
		if (
			(statement.type === "ForOfStatement" ||
				statement.type === "ForStatement") &&
			statement.body.type === "BlockStatement"
		) {
			return expandTestStatements(statement.body.body, context, depth + 1);
		}

		if (
			statement.type === "ExpressionStatement" &&
			statement.expression.type === "CallExpression" &&
			statement.expression.callee.type === "Identifier"
		) {
			const declaration = context.localFunctions.get(
				statement.expression.callee.name,
			);
			if (declaration?.body) {
				return expandTestStatements(declaration.body.body, context, depth + 1);
			}
		}

		return [statement];
	});
}

function testName(file: ParsedFile, node: Argument | undefined) {
	if (node?.type === "TemplateLiteral") {
		return file.source.slice(node.start + 1, node.end - 1);
	}
	return stringValue(node);
}

function narrateStatements(
	statements: Statement[],
	context: Context,
	blockStart: number,
) {
	const steps: Step[] = [];
	let previousEnd = blockStart + 1;

	for (const statement of statements) {
		const notes = commentsBetween(context.file, previousEnd, statement.start);
		previousEnd = statement.end;

		const step = narrateStatement(statement, context);
		if (!step) continue;

		steps.push({
			...step,
			line: lineOf(context.file, statement.start),
			endLine: lineOf(context.file, statement.end),
			notes: [...notes, ...step.notes],
		});
	}

	return steps;
}

function narrateStatement(statement: Statement, context: Context): Step | null {
	const code = textOf(context.file, statement);

	if (statement.type === "ExpressionStatement") {
		const expression = unwrapAwait(statement.expression);
		if (expression.type === "CallExpression") {
			return narrateCall(expression, context, code);
		}
		if (expression.type === "AssignmentExpression") {
			return narrateBinding(expression.left, expression.right, context, code);
		}
		return fallbackStep(code);
	}

	if (statement.type === "TryStatement") {
		return blockStep(
			"Try",
			narrateStatements(statement.block.body, context, statement.block.start),
			code,
		);
	}

	if (statement.type === "IfStatement") {
		const children =
			statement.consequent.type === "BlockStatement"
				? narrateStatements(
						statement.consequent.body,
						context,
						statement.consequent.start,
					)
				: [narrateStatement(statement.consequent, context)].filter(
						(s): s is Step => s !== null,
					);
		return blockStep(
			`If ${inlineCode(textOf(context.file, statement.test))}`,
			children,
			code,
		);
	}

	if (statement.type === "VariableDeclaration") {
		return narrateDeclaration(statement, context, code);
	}

	if (
		statement.type === "ForOfStatement" ||
		statement.type === "ForStatement"
	) {
		const body = statement.body;
		const children =
			body.type === "BlockStatement"
				? narrateStatements(body.body, context, body.start)
				: [narrateStatement(body, context)].filter(
						(s): s is Step => s !== null,
					);

		const header =
			statement.type === "ForOfStatement"
				? `For each ${inlineCode(textOf(context.file, statement.left).replace(/^const /, ""))} of ${value(statement.right, context)}`
				: `Repeat ${inlineCode(context.file.source.slice(statement.start, body.start).trim())}`;

		return blockStep(header, children, code);
	}

	return fallbackStep(code);
}

function blockStep(html: string, children: Step[], code: string): Step {
	return { ...emptyStep(code), phase: loopPhase(children), html, children };
}

function narrateDeclaration(
	statement: Extract<Statement, { type: "VariableDeclaration" }>,
	context: Context,
	code: string,
): Step | null {
	const [declarator] = statement.declarations;
	if (statement.declarations.length !== 1 || !declarator.init) {
		return fallbackStep(code);
	}

	return narrateBinding(declarator.id, declarator.init, context, code);
}

/** `const target = value` or `target = value`. */
function narrateBinding(
	targetNode: Node,
	valueNode: Expression,
	context: Context,
	code: string,
): Step | null {
	const declarator = { id: targetNode, init: valueNode };
	const init = unwrapAwait(valueNode);
	const target = textOf(context.file, targetNode);
	const binds = ` <span class="binds">→ ${escapeHtml(target)}</span>`;

	const formSchemaName = formHelpersSchemaName(init);
	if (formSchemaName && declarator.id.type === "Identifier") {
		const schema = formSchemaOf(context.file.path, formSchemaName);
		if (schema) context.formVariables.set(declarator.id.name, schema);
		return null;
	}

	if (
		init.type === "NewExpression" &&
		init.callee.type === "Identifier" &&
		context.pageObjects.classes.has(init.callee.name)
	) {
		if (declarator.id.type === "Identifier") {
			context.variableClasses.set(declarator.id.name, init.callee.name);
		}
		return null;
	}

	const isComputedValue =
		init.type === "CallExpression" &&
		declarator.init.type !== "AwaitExpression" &&
		!isPageRooted(init, context);
	if (isComputedValue) {
		return {
			...emptyStep(code),
			phase: null,
			html: `${inlineCode(target)} = ${inlineCode(textOf(context.file, init))}`,
		};
	}

	if (init.type === "CallExpression") {
		const step = narrateCall(init, context, code);
		if (!step) return null;
		if (step.testStep) return step;

		const returnsClass = methodOf(init, context)?.returnsClass;
		if (returnsClass && declarator.id.type === "Identifier") {
			context.variableClasses.set(declarator.id.name, returnsClass);
		}

		return { ...step, html: step.html + binds };
	}

	if (init.type === "MemberExpression" && isPageRooted(init, context)) {
		return {
			...emptyStep(code),
			phase: null,
			html: `${inlineCode(target)} = <strong>${noun(init, context)}</strong>`,
		};
	}

	return {
		...emptyStep(code),
		phase: null,
		html: `${inlineCode(target)} = ${inlineCode(textOf(context.file, init))}`,
	};
}

function narrateCall(
	call: CallExpression,
	context: Context,
	code: string,
): Step | null {
	const step = emptyStep(code);
	const callee = call.callee;

	const testStep = testStepOf(call);
	if (testStep) {
		const children = testStep.body
			? narrateStatements(testStep.body.body, context, testStep.body.start)
			: [];
		return {
			...step,
			phase: loopPhase(children),
			html: escapeHtml(testStep.title),
			children,
			testStep: testStep.title,
		};
	}

	const expectation = expectChain(call);
	if (expectation) {
		const args = call.arguments.map((arg) => value(arg, context));
		const phrase = MATCHERS[expectation.matcher]?.(args) ?? [
			`${humanize(expectation.matcher.replace(/^to/, ""))} ${args.join(", ")}`,
			`not ${humanize(expectation.matcher.replace(/^to/, ""))} ${args.join(", ")}`,
		];
		const subject = expectation.subject
			? noun(expectation.subject, context)
			: "";

		return {
			...step,
			phase: "assert",
			html: `<strong>${subject}</strong> ${phrase[expectation.negated ? 1 : 0]}`,
			pageClass: expectation.subject
				? rootClass(expectation.subject, context)
				: null,
		};
	}

	if (callee.type === "Identifier") {
		const name = callee.name;
		if (OMITTED_HELPERS.has(name)) return null;

		if (name === "impersonate") {
			return {
				...step,
				phase: "act",
				actor: actorOf(call.arguments[1], context),
			};
		}

		if (name.startsWith("waitFor")) {
			const inner = call.arguments.find(
				(arg) => arg.type === "ArrowFunctionExpression",
			);
			if (inner?.type === "ArrowFunctionExpression") {
				const body =
					inner.body.type === "BlockStatement"
						? inner.body.body[0]
						: {
								type: "ExpressionStatement",
								expression: inner.body,
								start: inner.body.start,
								end: inner.body.end,
							};
				const narrated = body
					? narrateStatement(body as Statement, context)
					: null;
				if (narrated) return { ...narrated, code };
			}
		}

		if (name === "navigate") {
			const url = objectProperty(call.arguments[0], "url");
			return {
				...step,
				phase: "act",
				html: `Go to ${url ? value(url, context) : "page"}`,
				pageClass: "",
			};
		}

		const helper =
			context.localHelpers.get(name) ?? context.pageObjects.helpers.get(name);
		const args = callArguments(call, context);

		if (/^(is|expect|assert)[A-Z]/.test(name)) {
			const [subject, ...rest] = call.arguments.filter(
				(arg) => !isBoilerplateArg(arg),
			);
			const subjectHtml = subject
				? `<strong>${noun(subject, context)}</strong> `
				: "";
			const phrase = escapeHtml(humanize(name.replace(/^(expect|assert)/, "")));
			return {
				...step,
				phase: "assert",
				html: `${subjectHtml}${withRef(phrase, helper, context)} ${rest.map((arg) => value(arg, context)).join(", ")}`.trim(),
			};
		}

		return {
			...step,
			phase: usesFactories(call) ? "arrange" : "act",
			html: `${withRef(sentence(name), helper, context)} ${args}`.trim(),
		};
	}

	if (
		callee.type !== "MemberExpression" ||
		callee.property.type !== "Identifier"
	) {
		return fallbackStep(code);
	}

	const method = callee.property.name;
	const receiver = callee.object;
	const path = memberPath(receiver);

	if (path[0] === "factories") {
		const entity = humanize((path[1] ?? "").replace(/Factory$/, ""));
		const [first, ...rest] = call.arguments;
		const html =
			method === "createMany"
				? `Create ${value(first, context)} × ${entity} ${rest.map((arg) => value(arg, context)).join(" ")}`
				: `${sentence(method)} ${entity} ${call.arguments.map((arg) => value(arg, context)).join(" ")}`;
		return { ...step, phase: "arrange", html: html.trim() };
	}

	if (path[0] === "page" && path.length === 1) {
		if (method === "setViewportSize") {
			return {
				...step,
				phase: "arrange",
				html: `Use a ${value(call.arguments[0], context)} viewport`,
			};
		}
		if (method === "reload")
			return { ...step, phase: "act", html: "Reload the page" };
		if (method === "goto") {
			return {
				...step,
				phase: "act",
				html: `Go to ${value(call.arguments[0], context)}`,
				pageClass: "",
			};
		}
	}

	if (path.join(".") === "page.keyboard" && method === "press") {
		return {
			...step,
			phase: "act",
			html: `Press <kbd>${escapeHtml(stringValue(call.arguments[0]) ?? "?")}</kbd>`,
		};
	}

	const pageClass = rootClass(receiver, context);

	const formSchema = formSchemaOfReceiver(receiver, context);
	if (
		(formSchema || /form$/i.test(path.at(-1) ?? "")) &&
		call.arguments.length > 0
	) {
		const fieldName =
			stringValue(call.arguments[0]) ?? textOf(context.file, call.arguments[0]);
		const formField = formSchema?.get(fieldName);
		const field = `<strong>${withRef(escapeHtml(formField?.label ?? humanize(fieldName)), formField?.ref, context)}</strong>`;
		const [, ...rest] = call.arguments.map((arg) => {
			const optionValue = stringValue(arg);
			const optionLabel =
				optionValue !== null ? formField?.items.get(optionValue) : undefined;
			return optionLabel ? quoted(optionLabel) : value(arg, context);
		});
		const html =
			method === "fill"
				? `Fill ${field} with ${rest.join(", ")}`
				: method === "select"
					? `Select ${rest.join(", ")} for ${field}`
					: method.startsWith("set")
						? `Set ${field} to ${rest.join(", ")}`
						: `${sentence(method)} ${field} ${rest.join(", ")}`;
		return { ...step, phase: "act", html: html.trim(), pageClass };
	}

	if (LOCATOR_ACTIONS[method] && !methodOf(call, context)) {
		const args = call.arguments.map((arg) => value(arg, context));
		const target = `<strong>${noun(receiver, context)}</strong>`;
		const html =
			method === "fill"
				? `Fill ${target} with ${args.join(", ")}`
				: method === "selectOption"
					? `Select ${args.join(", ")} in ${target}`
					: `${LOCATOR_ACTIONS[method]} ${target} ${args.join(", ")}`;
		return { ...step, phase: "act", html: html.trim(), pageClass };
	}

	const methodRef = methodOf(call, context)?.ref;
	const args = callArguments(call, context);
	const html =
		method === "goto" && pageClass
			? `${withRef("Open", methodRef, context)} the <strong>${escapeHtml(humanize(pageClass))}</strong> ${args}`
			: `${withRef(sentence(method), methodRef, context)} ${args}`;

	return {
		...step,
		phase: usesFactories(call) ? "arrange" : "act",
		html: html.trim(),
		pageClass,
	};
}

/** Splits a test at its `test.step`s, what is done between them making untitled chapters. */
function chaptersOf(
	steps: Step[],
	context: Context,
	startingActor: Actor | null,
): Chapter[] {
	const chapters: Chapter[] = [];
	let actor = startingActor;
	let outsideSteps: Step[] = [];

	const addChapter = (
		title: string | null,
		[first, last]: [Step, Step],
		chapterSteps: Step[],
	) => {
		chapters.push({
			title,
			line: first.line,
			endLine: last.endLine,
			segments: layout(chapterSteps, context, actor),
		});
		actor = chapterSteps.findLast((step) => step.actor)?.actor ?? actor;
	};
	const addOutsideSteps = () => {
		if (outsideSteps.length === 0) return;
		addChapter(null, [outsideSteps[0], outsideSteps.at(-1)!], outsideSteps);
		outsideSteps = [];
	};

	for (const step of steps) {
		if (step.testStep) {
			addOutsideSteps();
			addChapter(step.testStep, [step, step], step.children);
		} else {
			outsideSteps.push(step);
		}
	}
	addOutsideSteps();

	return chapters;
}

/** Groups steps into who did them, the page they were done on and arrange/act/assert runs. */
function layout(
	steps: Step[],
	context: Context,
	startingActor: Actor | null,
): Segment[] {
	const segments: Segment[] = [{ actor: null, items: [] }];
	let currentPage: string | null = null;

	const resolved = resolveNamingPhases(steps);

	for (const step of resolved) {
		if (step.actor) {
			segments.push({ actor: step.actor, items: [] });
			currentPage = null;
			continue;
		}

		if (!segments.at(-1)!.actor && step.phase !== "arrange" && !step.isNaming) {
			segments.push({ actor: startingActor ?? LOGGED_OUT, items: [] });
		}
		const segment = segments.at(-1)!;

		if (step.pageClass !== null && step.pageClass !== currentPage) {
			currentPage = step.pageClass;
			if (step.pageClass) {
				const label = humanize(step.pageClass);
				segment.items.push({
					kind: "divider",
					line: step.line,
					plainLabel: label.charAt(0).toUpperCase() + label.slice(1),
					html: withRef(
						escapeHtml(label.charAt(0).toUpperCase() + label.slice(1)),
						context.pageObjects.classes.get(step.pageClass)?.ref,
						context,
					),
				});
			}
		}

		const phase = step.phase ?? "act";
		const last = segment.items.at(-1);
		if (last?.kind === "run" && last.phase === phase) last.steps.push(step);
		else segment.items.push({ kind: "run", phase, steps: [step] });
	}

	return segments.filter((segment) => segment.items.length > 0);
}

/** Values being named read as part of the phase of the step using them next. */
function resolveNamingPhases(
	steps: Step[],
	enclosingPhase: Phase | null = null,
): Step[] {
	return steps.map((step, index) => {
		const children = resolveNamingPhases(
			step.children,
			step.phase ?? enclosingPhase ?? "act",
		);
		if (step.phase !== null) return { ...step, children };

		const next = steps
			.slice(index + 1)
			.find((candidate) => candidate.phase !== null && !candidate.actor);
		const previous = steps
			.slice(0, index)
			.findLast((candidate) => candidate.phase !== null && !candidate.actor);
		const isBeforeAnyActor =
			enclosingPhase === null &&
			!steps.slice(0, index).some((candidate) => candidate.actor);

		return {
			...step,
			children,
			phase: isBeforeAnyActor
				? "arrange"
				: (enclosingPhase ?? next?.phase ?? previous?.phase ?? "act"),
			isNaming: true,
		};
	});
}

function colorActors(actors: Actor[], chapters: Chapter[]) {
	const colors = new Map<string, string>();
	let otherIndex = 0;
	for (const actor of actors) {
		colors.set(
			actor.key,
			actor.color || OTHER_USER_COLORS[otherIndex++ % OTHER_USER_COLORS.length],
		);
	}
	const colored = (actor: Actor) => ({
		...actor,
		color: colors.get(actor.key) ?? actor.color,
	});

	return {
		actors: actors.map(colored),
		chapters: chapters.map((chapter) => ({
			...chapter,
			segments: chapter.segments.map((segment) => ({
				...segment,
				actor: segment.actor ? colored(segment.actor) : null,
			})),
		})),
	};
}

function actorsOf(steps: Step[], startingActor: Actor | null) {
	const actors = new Map<string, Actor>();
	if (startingActor) actors.set(startingActor.key, startingActor);
	const flattened = steps.flatMap((step) =>
		step.testStep ? step.children : [step],
	);
	for (const step of flattened) {
		if (step.actor) actors.set(step.actor.key, step.actor);
	}
	return [...actors.values()];
}

function actorOf(arg: Argument | undefined, context: Context): Actor {
	const key = arg ? textOf(context.file, arg) : "ADMIN_ID";
	const known = KNOWN_USERS[key];
	if (known) return { key, ...known };

	return {
		key,
		label: humanize(key.replace(/\.id$|\.?[uU]serId$|Id$/, "")),
		color: "",
	};
}

function expectChain(call: CallExpression) {
	if (
		call.callee.type !== "MemberExpression" ||
		call.callee.property.type !== "Identifier"
	) {
		return null;
	}

	const matcher = call.callee.property.name;
	let negated = false;
	let object: Expression = call.callee.object;
	while (object.type === "MemberExpression") {
		if (
			object.property.type === "Identifier" &&
			object.property.name === "not"
		) {
			negated = !negated;
		}
		object = object.object;
	}

	if (object.type !== "CallExpression") return null;
	const expectPath = memberPath(object.callee);
	if (expectPath[0] !== "expect") return null;

	return { matcher, negated, subject: object.arguments[0] ?? null };
}

/** The noun phrase of something a test looks at, e.g. `scrims.locators.requestButtons` → "request buttons". */
function noun(node: Argument, context: Context): string {
	const expression = unwrapAwait(node as Expression);

	if (expression.type === "Identifier") {
		if (expression.name === "page") return "the page";
		const className = context.variableClasses.get(expression.name);
		if (className) return `the ${escapeHtml(humanize(className))}`;
		return value(expression, context);
	}

	if (!isPageRooted(expression, context)) return value(expression, context);

	if (
		expression.type === "MemberExpression" &&
		expression.property.type === "Identifier"
	) {
		const className = rootClass(expression, context);
		const pageObject = className
			? context.pageObjects.classes.get(className)
			: undefined;
		const isLocator = memberPath(expression.object).at(-1) === "locators";
		const ref = isLocator
			? pageObject?.locators.get(expression.property.name)
			: pageObject?.methods.get(expression.property.name)?.ref;

		return withRef(
			escapeHtml(humanize(expression.property.name)),
			ref,
			context,
		);
	}

	if (
		expression.type === "CallExpression" &&
		expression.callee.type === "MemberExpression" &&
		expression.callee.property.type === "Identifier"
	) {
		const method = expression.callee.property.name;
		const receiver = expression.callee.object;
		const args = expression.arguments.map((arg) => value(arg, context));
		const isPageQuery =
			receiver.type === "Identifier" || memberPath(receiver).at(-1) === "page";
		const scope = isPageQuery ? "" : `${noun(receiver, context)} › `;

		if (method === "first" || method === "last")
			return `${method} ${noun(receiver, context)}`;
		if (method === "nth") return `${noun(receiver, context)} #${args[0]}`;
		if (method === "getByRole") {
			const name = objectProperty(expression.arguments[1], "name");
			return `${scope}${escapeHtml(stringValue(expression.arguments[0]) ?? "")}${name ? ` ${value(name, context)}` : ""}`;
		}
		if (LOCATOR_QUERIES[method])
			return `${scope}${LOCATOR_QUERIES[method]} ${args.join(", ")}`;
		if (method === "locator") return `${scope}${args.join(", ")}`;

		return `${withRef(escapeHtml(humanize(method)), methodOf(expression, context)?.ref, context)} ${args.join(", ")}`.trim();
	}

	return value(expression, context);
}

/** A literal-ish argument as HTML: strings quoted, known users and constants resolved. */
function value(node: Argument | null | undefined, context: Context): string {
	if (!node) return "";
	const expression = unwrapAwait(node as Expression);
	const code = textOf(context.file, expression);

	switch (expression.type) {
		case "Literal":
			if (typeof expression.value === "string") return quoted(expression.value);
			if (typeof expression.value === "number")
				return `<span class="num">${expression.value}</span>`;
			return inlineCode(code);
		case "TemplateLiteral":
			if (expression.expressions.length === 0) {
				return quoted(expression.quasis[0].value.cooked ?? "");
			}
			return inlineCode(code);
		case "Identifier": {
			if (KNOWN_USERS[expression.name]) {
				return `<span class="user" data-actor="${escapeHtml(expression.name)}">${escapeHtml(KNOWN_USERS[expression.name].label)}</span>`;
			}
			const constant = context.constants.get(expression.name);
			if (constant)
				return `<span class="const" title="${escapeHtml(expression.name)}">${constant}</span>`;
			return inlineCode(code);
		}
		case "ArrayExpression":
			return expression.elements
				.map((element) =>
					element?.type === "ArrayExpression"
						? `<span class="tuple">${value(element, context)}</span>`
						: value(element as Argument, context),
				)
				.join(", ");
		case "ObjectExpression":
			return expression.properties
				.map((property) => {
					if (property.type !== "Property")
						return inlineCode(textOf(context.file, property));
					const key = textOf(context.file, property.key);
					if (key === "page") return "";
					if (property.shorthand) return inlineCode(key);
					const isUser =
						property.value.type === "Identifier" &&
						Boolean(KNOWN_USERS[property.value.name]);
					const label = isUser ? key.replace(/(User)?Id$/, "") : key;
					return `<span class="kv"><span class="key">${escapeHtml(humanize(label))}</span> ${value(property.value, context)}</span>`;
				})
				.filter(Boolean)
				.join(" ");
		default:
			return inlineCode(code);
	}
}

function callArguments(call: CallExpression, context: Context) {
	return call.arguments
		.filter((arg) => !isBoilerplateArg(arg))
		.map((arg) => value(arg, context))
		.join(", ");
}

function isBoilerplateArg(arg: Argument) {
	return (
		arg.type === "Identifier" &&
		(arg.name === "page" || arg.name === "factories")
	);
}

function usesFactories(call: CallExpression) {
	return call.arguments.some(
		(arg) => arg.type === "Identifier" && arg.name === "factories",
	);
}

/** Fields of the form helpers a call is made on: `newPost.form` or a `createFormHelpers` variable. */
function formSchemaOfReceiver(receiver: Expression, context: Context) {
	if (receiver.type === "Identifier") {
		return context.formVariables.get(receiver.name) ?? null;
	}
	if (
		receiver.type === "MemberExpression" &&
		receiver.property.type === "Identifier"
	) {
		const className = rootClass(receiver.object, context);
		return className
			? (context.pageObjects.classes
					.get(className)
					?.forms.get(receiver.property.name) ?? null)
			: null;
	}
	return null;
}

function methodOf(call: CallExpression, context: Context) {
	if (
		call.callee.type !== "MemberExpression" ||
		call.callee.property.type !== "Identifier"
	) {
		return null;
	}
	const className = rootClass(call.callee.object, context);
	if (!className) return null;

	return (
		context.pageObjects.classes
			.get(className)
			?.methods.get(call.callee.property.name) ?? null
	);
}

/** Page object class the expression starts from, e.g. `scrims.locators.x` → ScrimsPage. */
function rootClass(node: Node, context: Context): string | null {
	let current = node as Expression;
	while (true) {
		current = unwrapAwait(current);
		if (current.type === "MemberExpression") current = current.object;
		else if (current.type === "CallExpression") current = current.callee;
		else break;
	}

	if (current.type === "Identifier")
		return context.variableClasses.get(current.name) ?? null;
	if (
		current.type === "NewExpression" &&
		current.callee.type === "Identifier"
	) {
		return context.pageObjects.classes.has(current.callee.name)
			? current.callee.name
			: null;
	}

	return null;
}

function isPageRooted(node: Node, context: Context) {
	let current = unwrapAwait(node as Expression);
	while (
		current.type === "MemberExpression" ||
		current.type === "CallExpression"
	) {
		current = unwrapAwait(
			current.type === "MemberExpression" ? current.object : current.callee,
		);
	}

	if (
		current.type === "NewExpression" &&
		current.callee.type === "Identifier"
	) {
		return context.pageObjects.classes.has(current.callee.name);
	}

	return (
		current.type === "Identifier" &&
		(current.name === "page" || context.variableClasses.has(current.name))
	);
}

/** `test.step(title, async () => { … })`, also with its options argument. */
function testStepOf(call: CallExpression) {
	if (memberPath(call.callee).join(".") !== "test.step") return null;
	const title = stringValue(call.arguments[0]);
	const callback = call.arguments[1];
	if (title === null) return null;

	return {
		title,
		body:
			(callback?.type === "ArrowFunctionExpression" ||
				callback?.type === "FunctionExpression") &&
			callback.body?.type === "BlockStatement"
				? callback.body
				: null,
	};
}

function memberPath(node: Node): string[] {
	if (node.type === "Identifier") return [node.name];
	if (node.type === "MemberExpression" && node.property.type === "Identifier") {
		return [...memberPath(node.object), node.property.name];
	}
	return [];
}

function objectProperty(node: Argument | undefined, key: string) {
	if (node?.type !== "ObjectExpression") return null;
	for (const property of node.properties) {
		if (
			property.type === "Property" &&
			property.key.type === "Identifier" &&
			property.key.name === key
		) {
			return property.value;
		}
	}
	return null;
}

function unwrapAwait(node: Expression): Expression {
	if (node.type === "AwaitExpression") return unwrapAwait(node.argument);
	if (node.type === "ParenthesizedExpression")
		return unwrapAwait(node.expression);
	if (node.type === "TSAsExpression" || node.type === "TSSatisfiesExpression") {
		return unwrapAwait(node.expression);
	}
	return node;
}

function stringValue(node: Argument | undefined) {
	if (node?.type === "Literal" && typeof node.value === "string")
		return node.value;
	if (node?.type === "TemplateLiteral" && node.expressions.length === 0) {
		return node.quasis[0].value.cooked;
	}
	return null;
}

function topLevelConstants(file: ParsedFile) {
	const constants = new Map<string, string>();

	for (const statement of file.program.body) {
		if (statement.type !== "VariableDeclaration" || statement.kind !== "const")
			continue;
		for (const declarator of statement.declarations) {
			if (declarator.id.type !== "Identifier" || !declarator.init) continue;
			const init = declarator.init;
			const isLiteral = (node: Node | null) =>
				node?.type === "Literal" ||
				(node?.type === "TemplateLiteral" && node.expressions.length === 0);

			if (isLiteral(init)) {
				constants.set(declarator.id.name, literalHtml(init));
			} else if (
				init.type === "ArrayExpression" &&
				init.elements.every(isLiteral)
			) {
				constants.set(
					declarator.id.name,
					init.elements.map((element) => literalHtml(element!)).join(", "),
				);
			}
		}
	}

	return constants;
}

function literalHtml(node: Node) {
	if (node.type === "Literal" && typeof node.value === "number") {
		return `<span class="num">${node.value}</span>`;
	}
	if (node.type === "TemplateLiteral")
		return quoted(node.quasis[0].value.cooked ?? "");
	return quoted(String(node.type === "Literal" ? node.value : ""));
}

function localHelpers(file: ParsedFile) {
	const helpers = new Map<string, SourceRef>();
	for (const statement of file.program.body) {
		if (statement.type === "FunctionDeclaration" && statement.id) {
			helpers.set(
				statement.id.name,
				sourceRef(file, statement.id.name, statement, statement),
			);
		}
	}
	return helpers;
}

/** Wraps HTML so hovering it shows where it was generated from. */
function withRef(html: string, ref: SourceRef | undefined, context: Context) {
	if (!ref) return html;

	const id = `${ref.file}:${ref.line}:${ref.title}`;
	context.refs.set(id, ref);

	return `<span class="ref" data-ref="${escapeHtml(id)}">${html}</span>`;
}

function loopPhase(children: Step[]): Phase {
	const phases = new Set(children.map((child) => child.phase).filter(Boolean));
	if (phases.size === 1) return [...phases][0]!;
	if (phases.has("arrange")) return "arrange";
	return "act";
}

function emptyStep(code: string): Step {
	return {
		phase: "act",
		isNaming: false,
		html: "",
		code,
		line: 0,
		endLine: 0,
		notes: [],
		pageClass: null,
		children: [],
		actor: null,
		testStep: null,
	};
}

function fallbackStep(code: string): Step {
	return {
		...emptyStep(code),
		phase: code.includes("factories") ? "arrange" : "act",
		html: inlineCode(code),
	};
}

function quoted(text: string) {
	return `<span class="str">“${escapeHtml(text)}”</span>`;
}

function inlineCode(code: string) {
	const singleLine = code.replace(/\s*\n\s*/g, " ");
	const short =
		singleLine.length > 80 ? `${singleLine.slice(0, 77)}…` : singleLine;

	return `<code class="inline" title="${escapeHtml(singleLine)}">${highlight(short)}</code>`;
}

/** "selectPickupUsers" → "Select pickup users" */
function sentence(identifier: string) {
	const words = humanize(identifier);
	return escapeHtml(words.charAt(0).toUpperCase() + words.slice(1));
}

/** "selectPickupUsers" → "select pickup users", acronyms kept. */
export function humanize(identifier: string) {
	return identifier
		.replace(/SendouQ/g, "Sendouq")
		.replace(/^goto(?=[A-Z])/, "goTo")
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.split(" ")
		.map((word) => (/^[A-Z][a-z]/.test(word) ? word.toLowerCase() : word))
		.join(" ")
		.replace(/\bsendouq\b/g, "SendouQ")
		.trim();
}
