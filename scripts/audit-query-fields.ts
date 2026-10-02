/** biome-ignore-all lint/suspicious/noConsole: CLI output, the report goes to stdout and progress to stderr */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import {
	isArrayLiteralExpression,
	isArrowFunction,
	isBlock,
	isCallExpression,
	isFunctionDeclaration,
	isIdentifier,
	isNoSubstitutionTemplateLiteral,
	isObjectLiteralExpression,
	isParenthesizedExpression,
	isPropertyAccessExpression,
	isPropertyAssignment,
	isReturnStatement,
	isSpreadElement,
	isStringLiteral,
	isVariableDeclaration,
	type Node,
} from "typescript/unstable/ast";
import {
	API as AsyncAPI,
	type Project as AsyncProject,
} from "typescript/unstable/async";
import {
	API,
	type Checker,
	type Diagnostic,
	type Project,
	SignatureKind,
	type Type,
	TypeFlags,
} from "typescript/unstable/sync";

const ROOT = process.cwd();
const TSCONFIG = path.join(ROOT, "tsconfig.json");
const TYPEGEN_ROOT = path.join(ROOT, ".react-router", "types");
const ENTITY_QUERY_FILE = path.join(ROOT, "app", "db", "entity-query.ts");
const ENTITY_QUERY_TEST_FILE = path.join(
	ROOT,
	"app",
	"db",
	"entity-query.test.ts",
);
const FULL_CHECK_THRESHOLD = 600;
const DEFAULT_WORKERS = 4;
const SITES_SHOWN = 12;
const READ_CODES = new Set([2339, 2551]);
const TYPE_DEMAND_CODES = new Set([2322, 2344, 2345, 2353, 2739, 2740, 2741]);
const UNUSED_CODES = new Set([6133, 6138, 6192, 6196, 6198, 6199, 6205]);
const IMPORT_SPECIFIER =
	/(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
const ROW_CHANGING_METHODS = new Set([
	"where",
	"whereRef",
	"innerJoin",
	"leftJoin",
	"rightJoin",
	"fullJoin",
	"groupBy",
	"having",
	"distinct",
	"limit",
	"sortedBy",
]);
const API_ROUTE = /\/features\/api-[^/]+\/routes\//;
const USAGE = `Usage: node scripts/audit-query-fields.ts [--query <name>] [--json <path>] [--workers <n>] [--full]

Removes each base select field and each field-adding chain step call of every defineQuery
definition in turn, type-checks the project and reports where the build breaks.

  --query <name>  only definitions whose name contains this, e.g. "teams" or "ScrimPostRepository"
  --json <path>   also write the raw results as JSON, every site included
  --workers <n>   type checkers running in parallel, ${DEFAULT_WORKERS} by default
  --list          only list what would be removed and checked
  --full          type-check the whole project per removal instead of the importers of the changed file`;

interface Site {
	file: string;
	line: number;
	isTest: boolean;
}

interface Outcome {
	reads: Site[];
	typeDemands: Site[];
	chainBreaks: Site[];
	other: Array<Site & { message: string }>;
	error?: string;
}

interface Target {
	label: string;
	file: string;
	line: number;
	isTest: boolean;
	start: number;
	end: number;
	/** Fields the removal takes off the row, how diagnostics are told apart as reads. */
	fields: string[];
	alsoFilters?: boolean;
	outcome?: Outcome;
}

interface Step {
	name: string;
	adds: string[];
	alsoFilters: boolean;
	calls: Target[];
}

interface Definition {
	name: string;
	root: string;
	file: string;
	line: number;
	entryPoints: Site[];
	baseFields: Target[];
	baseSkipped: string[];
	steps: Step[];
	/** Steps that only rewrite fields the row already has, which a removal can't reveal. */
	rewritingSteps: string[];
	oneOffs: Target[];
}

async function main() {
	const { values } = parseArgs({
		options: {
			query: { type: "string" },
			json: { type: "string" },
			workers: { type: "string", default: String(DEFAULT_WORKERS) },
			full: { type: "boolean", default: false },
			list: { type: "boolean", default: false },
			help: { type: "boolean", default: false },
		},
	});
	if (values.help) {
		console.log(USAGE);
		return;
	}

	const api = new API({ cwd: ROOT });
	let definitions: Definition[];
	let dependents: (fileName: string) => string[];
	let baseline: Set<string>;
	try {
		const project = api
			.updateSnapshot({ openProjects: [TSCONFIG] })
			.getProject(TSCONFIG);
		if (!project) throw new Error(`No project for ${TSCONFIG}`);

		definitions = collectDefinitions(project).filter(
			(definition) =>
				!values.query ||
				definition.name.toLowerCase().includes(values.query.toLowerCase()),
		);
		attachOneOffs(project, definitions);
		dependents = importDependents(project.program.getSourceFileNames());
		baseline = new Set(
			project.program.getSemanticDiagnostics().map(diagnosticKey),
		);
	} finally {
		api.close();
	}

	if (definitions.length === 0) {
		console.error("No defineQuery definitions matched");
		process.exitCode = 1;
		return;
	}
	if (baseline.size > 0) {
		console.error(
			`Warning: the project has ${baseline.size} type errors already, they are ignored`,
		);
	}

	const targets = definitions.flatMap((definition) => [
		...definition.baseFields,
		...definition.steps.flatMap((step) => step.calls),
		...definition.oneOffs,
	]);
	if (values.list) {
		for (const target of targets) {
			console.log(
				`${target.label}\t${relative(target.file)}:${target.line}\t${dependents(target.file).length} files to check`,
			);
		}
		return;
	}

	const queue = [...targets];
	const progress = { done: 0, total: targets.length };
	const workerCount = Math.max(1, Number(values.workers) || DEFAULT_WORKERS);

	await Promise.all(
		Array.from({ length: Math.min(workerCount, targets.length) }, () =>
			runWorker({
				queue,
				progress,
				dependents,
				baseline,
				full: values.full,
			}),
		),
	);

	console.log(renderReport(definitions));
	if (values.json) {
		fs.writeFileSync(values.json, JSON.stringify(definitions, null, 2));
	}
}

/** Takes targets off the shared queue one at a time, each worker its own tsgo process. */
async function runWorker({
	queue,
	progress,
	dependents,
	baseline,
	full,
}: {
	queue: Target[];
	progress: { done: number; total: number };
	dependents: (fileName: string) => string[];
	baseline: Set<string>;
	full: boolean | undefined;
}) {
	const overrides = new Map<string, string>();
	const api = new AsyncAPI({
		cwd: ROOT,
		fs: { readFile: (fileName) => overrides.get(fileName.toLowerCase()) },
	});

	try {
		let snapshot = await api.updateSnapshot({ openProjects: [TSCONFIG] });
		let previousFile: string | null = null;

		for (let target = queue.shift(); target; target = queue.shift()) {
			const startedAt = performance.now();
			const original = readText(target.file);
			const mutated =
				original.slice(0, target.start) + original.slice(target.end);
			overrides.set(target.file.toLowerCase(), mutated);

			const changed = [target.file];
			if (previousFile && !samePath(previousFile, target.file)) {
				changed.push(previousFile);
			}
			const nextSnapshot = await api.updateSnapshot({
				fileChanges: { changed },
			});
			await snapshot.dispose();
			snapshot = nextSnapshot;
			const project = snapshot.getProject(TSCONFIG);
			if (!project) throw new Error(`No project for ${TSCONFIG}`);

			target.outcome = await checkMutation({
				project,
				target,
				mutated,
				affected: dependents(target.file),
				full,
				baseline,
			});

			overrides.delete(target.file.toLowerCase());
			previousFile = target.file;
			progress.done++;
			console.error(
				`[${progress.done}/${progress.total}] ${target.label} (${relative(target.file)}:${target.line}) ${Math.round(performance.now() - startedAt)}ms`,
			);
		}
	} finally {
		await api.close();
	}
}

function collectDefinitions(project: Project): Definition[] {
	const definitions: Definition[] = [];

	for (const fileName of project.program.getSourceFileNames()) {
		if (!isAppFile(fileName) || isTestFile(fileName)) continue;
		if (samePath(fileName, ENTITY_QUERY_FILE)) continue;
		if (!readText(fileName).includes("defineQuery(")) continue;

		const sourceFile = project.program.getSourceFile(fileName);
		if (!sourceFile) continue;

		walk(sourceFile, (node) => {
			if (
				!isVariableDeclaration(node) ||
				!isIdentifier(node.name) ||
				!node.initializer ||
				!isCallExpression(node.initializer) ||
				!isIdentifier(node.initializer.expression) ||
				node.initializer.expression.text !== "defineQuery"
			) {
				return;
			}
			const config = node.initializer.arguments[0];
			if (!config || !isObjectLiteralExpression(config)) return;

			definitions.push(
				readDefinition({
					project,
					name: `${moduleName(fileName)}.${node.name.text}`,
					nameNode: node.name,
					config,
				}),
			);
		});
	}

	return definitions;
}

function readDefinition({
	project,
	name,
	nameNode,
	config,
}: {
	project: Project;
	name: string;
	nameNode: Node;
	config: Node;
}): Definition {
	const file = nameNode.getSourceFile().fileName;
	const property = (key: string) => {
		let found: Node | undefined;
		config.forEachChild((child) => {
			if (
				isPropertyAssignment(child) &&
				isIdentifier(child.name) &&
				child.name.text === key
			) {
				found = child.initializer;
			}
		});
		return found;
	};

	const rootNode = property("root");
	const { fields: baseFields, skipped: baseSkipped } = baseSelectTargets(
		property("select"),
	);
	const baseKeys = new Set([
		...baseFields.flatMap((target) => target.fields),
		...objectKeysReturnedBy(property("map")),
	]);
	const { steps, rewritingSteps } = stepsOf({
		checker: project.checker,
		vocabulary: property("vocabulary"),
		baseKeys,
	});

	return {
		name,
		root: rootNode && isStringLiteral(rootNode) ? rootNode.text : "?",
		file,
		line: lineOfNode(nameNode),
		entryPoints: entryPointsOf(project.checker, nameNode),
		baseFields,
		baseSkipped,
		steps,
		rewritingSteps,
		oneOffs: [],
	};
}

function baseSelectTargets(select: Node | undefined) {
	const fields: Target[] = [];
	const skipped: string[] = [];
	const selectCall = select && isArrowFunction(select) ? select.body : null;
	if (
		!selectCall ||
		!isCallExpression(selectCall) ||
		!isPropertyAccessExpression(selectCall.expression) ||
		selectCall.expression.name.text !== "select"
	) {
		return {
			fields,
			skipped: ["the base select is not a plain qb.select(...)"],
		};
	}

	let list: Node | undefined = selectCall.arguments[0];
	if (list && isArrowFunction(list)) list = unwrapParentheses(list.body);
	if (!list || !isArrayLiteralExpression(list)) {
		return {
			fields,
			skipped: [
				`the base select is a single expression (${truncate(list?.getText() ?? "?")}), not a list`,
			],
		};
	}

	const elements = list.elements;
	for (const [index, element] of elements.entries()) {
		if (isSpreadElement(element)) {
			skipped.push(`${truncate(element.getText())} (spread)`);
			continue;
		}

		const field = selectionName(element);
		const range = listElementRange(elements, index);
		fields.push({
			label: `base ${field}`,
			file: element.getSourceFile().fileName,
			line: lineOfNode(element),
			isTest: false,
			...range,
			fields: [field],
		});
	}

	return { fields, skipped };
}

function stepsOf({
	checker,
	vocabulary,
	baseKeys,
}: {
	checker: Checker;
	vocabulary: Node | undefined;
	baseKeys: Set<string>;
}) {
	const steps: Step[] = [];
	const rewritingSteps: string[] = [];
	const body =
		vocabulary && isArrowFunction(vocabulary)
			? unwrapParentheses(vocabulary.body)
			: undefined;
	if (!body || !isObjectLiteralExpression(body)) {
		return { steps, rewritingSteps };
	}

	for (const property of body.properties) {
		if (!isPropertyAssignment(property) || !isIdentifier(property.name)) {
			continue;
		}

		const stepType = checker.getTypeAtLocation(property.initializer);
		const signature = stepType
			? checker.getSignaturesOfType(stepType, SignatureKind.Call)[0]
			: undefined;
		const modifier = signature
			? checker.getReturnTypeOfSignature(signature)
			: undefined;
		const adds = modifier ? addedFields(checker, modifier) : [];
		if (adds.length === 0) continue;

		const name = property.name.text;
		const newFields = adds.filter((field) => !baseKeys.has(field));
		if (newFields.length === 0) {
			rewritingSteps.push(`${name} (${adds.join(", ")})`);
			continue;
		}

		const alsoFilters = changesRows(property.initializer);
		steps.push({
			name,
			adds,
			alsoFilters,
			calls: callsOf(checker, property.name).map((call) => ({
				...call,
				label: `step ${name}()`,
				fields: newFields,
				alsoFilters,
			})),
		});
	}

	return { steps, rewritingSteps };
}

/** Whether a step does more than add fields: filters, joins, sorts or lifts a guard on the root query. */
function changesRows(step: Node) {
	let changes = false;
	walk(step, (node) => {
		if (!isCallExpression(node) || !isIdentifier(node.expression)) return;

		if (node.expression.text === "lift") changes = true;
		if (node.expression.text === "sortedBy") changes = true;
		if (node.expression.text !== "refine") return;

		const callback = node.arguments[1];
		if (!callback || !isArrowFunction(callback)) return;
		for (const result of returnedExpressions(callback)) {
			if (spineMethods(result).some((name) => ROW_CHANGING_METHODS.has(name))) {
				changes = true;
			}
		}
		// `refine(...).sortedBy(...)`
		const parent = node.parent;
		if (
			parent &&
			isPropertyAccessExpression(parent) &&
			parent.name.text === "sortedBy"
		) {
			changes = true;
		}
	});
	return changes;
}

/** The methods called directly on a builder chain, `qb.where(...).select(...)` giving where and select but nothing inside their arguments. */
function spineMethods(expression: Node) {
	const names: string[] = [];
	let current = unwrapParentheses(expression);
	while (
		isCallExpression(current) &&
		isPropertyAccessExpression(current.expression)
	) {
		names.push(current.expression.name.text);
		current = unwrapParentheses(current.expression.expression);
	}
	return names;
}

function returnedExpressions(callback: Node): Node[] {
	if (!isArrowFunction(callback)) return [];
	if (!isBlock(callback.body)) return [callback.body];

	const results: Node[] = [];
	walk(callback.body, (node) => {
		if (isReturnStatement(node) && node.expression) {
			results.push(node.expression);
		}
	});
	return results;
}

function objectKeysReturnedBy(mapper: Node | undefined) {
	const body =
		mapper && isArrowFunction(mapper) ? unwrapParentheses(mapper.body) : null;
	if (!body || !isObjectLiteralExpression(body)) return [];

	return body.properties.flatMap((property) =>
		isPropertyAssignment(property) && isIdentifier(property.name)
			? [property.name.text]
			: [],
	);
}

/** What a chain step puts on the row, read from its `Modifier.__types`. */
function addedFields(checker: Checker, modifier: Type) {
	const types = checker.getPropertyOfType(modifier, "__types");
	const typesType = types ? checker.getTypeOfSymbol(types) : undefined;
	if (!typesType) return [];
	const definedTypes = checker.getNonNullableType(typesType) ?? typesType;

	const fields = new Set<string>();
	const added = checker.getPropertyOfType(definedTypes, "added");
	const addedType = added ? checker.getTypeOfSymbol(added) : undefined;
	if (addedType) {
		for (const symbol of checker.getPropertiesOfType(addedType)) {
			fields.add(symbol.name);
		}
	}

	const mapped = checker.getPropertyOfType(definedTypes, "mapped");
	const mappedType = mapped ? checker.getTypeOfSymbol(mapped) : undefined;
	if (mappedType && !(mappedType.flags & TypeFlags.Never)) {
		for (const literal of mappedType.isUnionType()
			? mappedType.getTypes()
			: [mappedType]) {
			if (literal.isStringLiteralType()) fields.add(literal.value);
		}
	}

	return [...fields];
}

/** Call sites of a vocabulary word, as removals of `.word(...)` from their chain. */
function callsOf(checker: Checker, nameNode: Node) {
	const declarationStart = nameNode.getStart();
	const declarationFile = nameNode.getSourceFile().fileName;
	const calls: Omit<Target, "label" | "fields">[] = [];

	for (const entry of checker.getReferencedSymbolsForNode(
		nameNode,
		declarationStart,
	)) {
		for (const reference of entry.references) {
			const node = reference.resolve();
			if (!node) continue;
			const fileName = node.getSourceFile().fileName;
			if (
				samePath(fileName, declarationFile) &&
				node.getStart() === declarationStart
			) {
				continue;
			}

			const access = node.parent;
			const call = access?.parent;
			if (
				!access ||
				!call ||
				!isPropertyAccessExpression(access) ||
				!isCallExpression(call) ||
				call.expression !== access
			) {
				continue;
			}

			calls.push({
				file: fileName,
				line: lineOfNode(call),
				isTest: isTestFile(fileName),
				start: access.expression.end,
				end: call.end,
			});
		}
	}

	return calls;
}

/** Where chains of the definition start, its repository's wrapper functions resolved to their callers. */
function entryPointsOf(checker: Checker, nameNode: Node, depth = 0): Site[] {
	const definitionFile = nameNode.getSourceFile().fileName;
	const sites: Site[] = [];

	for (const entry of checker.getReferencedSymbolsForNode(
		nameNode,
		nameNode.getStart(),
	)) {
		for (const reference of entry.references) {
			const node = reference.resolve();
			if (!node || node.getStart() === nameNode.getStart()) continue;
			if (!isCalled(node)) continue;

			const fileName = node.getSourceFile().fileName;
			const wrapper = samePath(fileName, definitionFile)
				? enclosingExportedFunction(node)
				: undefined;
			if (wrapper?.name && depth < 3) {
				sites.push(...entryPointsOf(checker, wrapper.name, depth + 1));
				continue;
			}

			sites.push({
				file: fileName,
				line: lineOfNode(node),
				isTest: isTestFile(fileName),
			});
		}
	}

	return sites;
}

/** `.withColumns([...])` entries and `.with(step)` calls whose step adds fields, attached by the chain's root table. */
function attachOneOffs(project: Project, definitions: Definition[]) {
	const { checker } = project;

	for (const fileName of project.program.getSourceFileNames()) {
		// the chain's own tests define throwaway queries over real root tables
		if (!isAppFile(fileName) || samePath(fileName, ENTITY_QUERY_TEST_FILE)) {
			continue;
		}
		const text = readText(fileName);
		if (!text.includes(".withColumns(") && !text.includes(".with(")) continue;

		const sourceFile = project.program.getSourceFile(fileName);
		if (!sourceFile) continue;

		walk(sourceFile, (node) => {
			if (
				!isCallExpression(node) ||
				!isPropertyAccessExpression(node.expression) ||
				!["withColumns", "with"].includes(node.expression.name.text)
			) {
				return;
			}
			const root = chainRoot(checker, node.expression.expression);
			const definition = definitions.find(
				(candidate) => candidate.root === root,
			);
			const argument = node.arguments[0];
			if (!definition || !argument) return;

			const site = {
				file: fileName,
				line: lineOfNode(node),
				isTest: isTestFile(fileName),
			};

			if (node.expression.name.text === "withColumns") {
				if (!isArrayLiteralExpression(argument)) return;
				for (const [index, element] of argument.elements.entries()) {
					if (!isStringLiteral(element)) continue;
					definition.oneOffs.push({
						...site,
						label: `withColumns ${element.text}`,
						...listElementRange(argument.elements, index),
						fields: [element.text],
					});
				}
				return;
			}

			const stepType = checker.getTypeAtLocation(argument);
			const adds = stepType ? addedFields(checker, stepType) : [];
			if (adds.length === 0) return;

			definition.oneOffs.push({
				...site,
				label: `with(${truncate(argument.getText())})`,
				alsoFilters: changesRows(argument),
				start: node.expression.expression.end,
				end: node.end,
				fields: adds,
			});
		});
	}
}

function chainRoot(checker: Checker, receiver: Node) {
	const receiverType = checker.getTypeAtLocation(receiver);
	const where = receiverType
		? checker.getPropertyOfType(receiverType, "where")
		: undefined;
	const whereType = where ? checker.getTypeOfSymbol(where) : undefined;
	if (!whereType) return null;

	return checker.typeToString(whereType).match(/Chain<"(\w+)"/)?.[1] ?? null;
}

async function checkMutation({
	project,
	target,
	mutated,
	affected,
	full,
	baseline,
}: {
	project: AsyncProject;
	target: Target;
	mutated: string;
	affected: string[];
	full: boolean | undefined;
	baseline: Set<string>;
}): Promise<Outcome> {
	const outcome: Outcome = {
		reads: [],
		typeDemands: [],
		chainBreaks: [],
		other: [],
	};

	const syntaxErrors = await project.program.getSyntacticDiagnostics(
		target.file,
	);
	if (syntaxErrors.length > 0) {
		outcome.error = `the removal broke the syntax: ${syntaxErrors[0].text}`;
		return outcome;
	}

	const diagnostics: Diagnostic[] = [];
	if (full || affected.length > FULL_CHECK_THRESHOLD) {
		diagnostics.push(...(await project.program.getSemanticDiagnostics()));
	} else {
		for (const fileName of affected) {
			diagnostics.push(
				...(await project.program.getSemanticDiagnostics(fileName)),
			);
		}
	}

	for (const diagnostic of diagnostics) {
		if (baseline.has(diagnosticKey(diagnostic))) continue;
		if (UNUSED_CODES.has(diagnostic.code)) continue;

		const fileName = diagnostic.fileName ?? target.file;
		const site: Site = {
			file: fileName,
			line: samePath(fileName, target.file)
				? lineOfPosition(mutated, diagnostic.pos)
				: lineOfPosition(readText(fileName), diagnostic.pos),
			isTest: isTestFile(fileName),
		};
		const message = flattenMessage(diagnostic);

		if (message.includes("'never'")) {
			outcome.chainBreaks.push(site);
		} else if (
			READ_CODES.has(diagnostic.code) &&
			target.fields.some((field) => message.includes(`'${field}'`))
		) {
			outcome.reads.push(site);
		} else if (TYPE_DEMAND_CODES.has(diagnostic.code)) {
			outcome.typeDemands.push(site);
		} else {
			outcome.other.push({ ...site, message: truncate(message, 160) });
		}
	}

	return outcome;
}

function renderReport(definitions: Definition[]) {
	const lines = [
		"# Query field audit",
		"",
		"Every base select field and every field-adding step call was removed in turn and the project type-checked.",
		"- **reads**: code reading the field broke (TS2339)",
		"- **type demands**: a declared type requires the field (a `Pick`, a prop type, a hand-written row type). Check whether anything reads it through that type",
		"- **chain**: a later step's mapper needs the field",
		"- **other**: any other error, listed with its message",
		"",
		"Counts are distinct files. Reads that skip the types (`as`, `any`, string keys) are invisible here.",
	];

	for (const definition of definitions) {
		const productionEntries = definition.entryPoints.filter(
			(site) => !site.isTest,
		);
		lines.push(
			"",
			`## ${definition.name} (root \`${definition.root}\`, ${relative(definition.file)}:${definition.line})`,
			"",
			`Entry points: ${productionEntries.length} in app code, ${definition.entryPoints.length - productionEntries.length} in tests`,
			...groupSites(productionEntries).map((group) => `- ${group}`),
		);

		lines.push("", "### Base select", "");
		if (definition.baseFields.length > 0) {
			lines.push(
				"| field | reads | type demands | chain | other | verdict |",
				"|---|---|---|---|---|---|",
				...definition.baseFields.map(
					(target) =>
						`| ${target.fields[0]} | ${countCells(target.outcome)} | ${verdictOf(target)} |`,
				),
			);
		}
		for (const reason of definition.baseSkipped) {
			lines.push(`- not audited: ${reason}`);
		}

		lines.push("", "### Steps", "");
		if (definition.steps.length === 0) {
			lines.push("No vocabulary steps add fields.");
		} else {
			lines.push(
				"| step | adds | calls | calls nothing reads | note |",
				"|---|---|---|---|---|",
				...definition.steps.map((step) => {
					const unused = step.calls.filter(
						(call) => verdictOf(call) === "UNUSED",
					);
					const note =
						step.calls.length === 0
							? "NEVER CALLED"
							: unused.length === step.calls.length
								? "UNUSED EVERYWHERE"
								: "";
					return `| ${step.name} | ${step.adds.join(", ")} | ${step.calls.length} | ${unused.length} | ${[note, step.alsoFilters ? "also changes the rows, keep calls that need that" : ""].filter(Boolean).join("; ")} |`;
				}),
			);
		}

		for (const rewriting of definition.rewritingSteps) {
			lines.push(
				`- not audited: ${rewriting} only rewrites fields the row already has`,
			);
		}

		lines.push("", "### Details", "");
		for (const target of [
			...definition.baseFields,
			...definition.steps.flatMap((step) => step.calls),
			...definition.oneOffs,
		]) {
			lines.push(...renderTargetDetails(target));
		}
	}

	return lines.join("\n");
}

function renderTargetDetails(target: Target) {
	const outcome = target.outcome;
	const where = `${relative(target.file)}:${target.line}${target.isTest ? " (test)" : ""}`;
	const verdict = verdictOf(target);
	const notes = [
		target.alsoFilters && verdict === "UNUSED"
			? "its fields; the step also changes which rows come back"
			: null,
		API_ROUTE.test(target.file) && verdict !== "used"
			? "an API route, its response may be read outside this codebase"
			: null,
	].filter(Boolean);
	const header = `- **${target.label}** at ${where}: ${verdict}${notes.length > 0 ? ` (${notes.join("; ")})` : ""}`;
	if (!outcome) return [header];
	if (outcome.error) return [`${header} (${outcome.error})`];

	const lines = [header];
	const kinds: Array<[string, Site[]]> = [
		["reads", outcome.reads],
		["type demands", outcome.typeDemands],
		["chain", outcome.chainBreaks],
	];
	for (const [kind, sites] of kinds) {
		if (sites.length > 0) {
			lines.push(`  - ${kind}: ${capped(groupSites(sites)).join("; ")}`);
		}
	}
	for (const other of capped(outcome.other)) {
		lines.push(
			typeof other === "string"
				? `  - other: ${other}`
				: `  - other: ${relative(other.file)}:${other.line} ${other.message}`,
		);
	}

	return lines;
}

function capped<T>(items: T[]): Array<T | string> {
	if (items.length <= SITES_SHOWN) return items;
	return [
		...items.slice(0, SITES_SHOWN),
		`…${items.length - SITES_SHOWN} more, see --json`,
	];
}

function countCells(outcome: Outcome | undefined) {
	if (!outcome) return "? | ? | ? | ?";
	const files = (sites: Site[]) => new Set(sites.map((site) => site.file)).size;

	return [
		files(outcome.reads),
		files(outcome.typeDemands),
		files(outcome.chainBreaks),
		files(outcome.other),
	].join(" | ");
}

function verdictOf(target: Target) {
	const outcome = target.outcome;
	if (!outcome) return "NOT CHECKED";
	if (outcome.error) return "ERROR";

	const sites = [
		...outcome.reads,
		...outcome.typeDemands,
		...outcome.chainBreaks,
		...outcome.other,
	];
	if (sites.length === 0) return "UNUSED";
	// a test's own calls are read by that test, only production code read by tests alone is suspicious
	if (!target.isTest && sites.every((site) => site.isTest)) {
		return "TEST ONLY";
	}
	if (outcome.reads.length === 0 && outcome.chainBreaks.length === 0) {
		return "TYPE ONLY";
	}
	return "used";
}

function groupSites(sites: Site[]) {
	const linesByFile = new Map<string, Set<number>>();
	for (const site of sites) {
		const key = `${relative(site.file)}${site.isTest ? " (test)" : ""}`;
		const lines = linesByFile.get(key) ?? new Set();
		lines.add(site.line);
		linesByFile.set(key, lines);
	}

	return [...linesByFile].map(
		([file, lines]) => `${file}:${[...lines].sort((a, b) => a - b).join(",")}`,
	);
}

/** For each file, a function giving it and every file that transitively imports it. */
function importDependents(fileNames: readonly string[]) {
	const known = new Map(fileNames.map((name) => [name.toLowerCase(), name]));
	const importers = new Map<string, Set<string>>();

	for (const fileName of fileNames) {
		if (!fileName.toLowerCase().startsWith(ROOT.toLowerCase())) continue;
		if (fileName.includes("/node_modules/")) continue;

		for (const match of readText(fileName).matchAll(IMPORT_SPECIFIER)) {
			for (const imported of resolveImport(fileName, match[1], known)) {
				const set = importers.get(imported) ?? new Set();
				set.add(fileName);
				importers.set(imported, set);
			}
		}
	}

	return (fileName: string) => {
		const start = known.get(fileName.toLowerCase()) ?? fileName;
		const seen = new Set([start]);
		const queue = [start];
		while (queue.length > 0) {
			const current = queue.pop()!;
			for (const importer of importers.get(current.toLowerCase()) ?? []) {
				if (seen.has(importer)) continue;
				seen.add(importer);
				queue.push(importer);
			}
		}
		return [...seen];
	};
}

function resolveImport(
	fromFile: string,
	specifier: string,
	known: Map<string, string>,
) {
	let base: string;
	if (specifier.startsWith("~/")) {
		base = path.join(ROOT, "app", specifier.slice(2));
	} else if (specifier.startsWith(".")) {
		base = path.resolve(path.dirname(fromFile), specifier);
	} else {
		return [];
	}

	// tsconfig rootDirs merges the route typegen output with the app folder
	const bases = [base];
	if (base.startsWith(TYPEGEN_ROOT)) {
		bases.push(path.join(ROOT, base.slice(TYPEGEN_ROOT.length)));
	} else if (base.startsWith(ROOT)) {
		bases.push(path.join(TYPEGEN_ROOT, base.slice(ROOT.length)));
	}

	const resolved: string[] = [];
	for (const candidateBase of bases) {
		const withoutJs = candidateBase.replace(/\.js$/, "");
		for (const candidate of [
			candidateBase,
			`${withoutJs}.ts`,
			`${withoutJs}.tsx`,
			`${withoutJs}.d.ts`,
			`${withoutJs}/index.ts`,
			`${withoutJs}/index.tsx`,
		]) {
			const key = candidate.toLowerCase();
			if (known.has(key)) resolved.push(key);
		}
	}

	return resolved;
}

function selectionName(element: Node) {
	if (isStringLiteral(element) || isNoSubstitutionTemplateLiteral(element)) {
		const alias = element.text.match(/\s+as\s+(\w+)$/)?.[1];
		return alias ?? element.text.split(".").at(-1) ?? element.text;
	}
	if (
		isCallExpression(element) &&
		isPropertyAccessExpression(element.expression) &&
		element.expression.name.text === "as"
	) {
		const alias = element.arguments[0];
		if (alias && isStringLiteral(alias)) return alias.text;
	}
	return truncate(element.getText());
}

function listElementRange(elements: readonly Node[], index: number) {
	const element = elements[index];
	const text = element.getSourceFile().text;
	const next = elements[index + 1];
	if (next) return { start: element.getStart(), end: next.getStart() };

	const previous = elements[index - 1];
	let end = element.end;
	while (/\s/.test(text[end] ?? "")) end++;
	if (text[end] === ",") end++;

	return { start: previous ? previous.end : element.getStart(), end };
}

function enclosingExportedFunction(node: Node) {
	let current: Node | undefined = node.parent;
	while (current) {
		if (isFunctionDeclaration(current)) {
			return /^\s*export\s/.test(current.getText()) ? current : undefined;
		}
		current = current.parent;
	}
	return undefined;
}

function isCalled(node: Node) {
	const parent = node.parent;
	if (!parent) return false;
	if (isCallExpression(parent)) return parent.expression === node;
	return (
		isPropertyAccessExpression(parent) &&
		parent.name === node &&
		parent.parent !== undefined &&
		isCallExpression(parent.parent) &&
		parent.parent.expression === parent
	);
}

function unwrapParentheses(node: Node): Node {
	return isParenthesizedExpression(node)
		? unwrapParentheses(node.expression)
		: node;
}

function walk(node: Node, visit: (node: Node) => void) {
	visit(node);
	node.forEachChild((child) => {
		walk(child, visit);
	});
}

function flattenMessage(diagnostic: Diagnostic): string {
	return [
		diagnostic.text,
		...(diagnostic.messageChain ?? []).map(flattenMessage),
	].join(" ");
}

function diagnosticKey(diagnostic: Diagnostic) {
	return `${diagnostic.fileName?.toLowerCase()}|${diagnostic.code}|${diagnostic.text}`;
}

const textCache = new Map<string, string>();
function readText(fileName: string) {
	const key = fileName.toLowerCase();
	let text = textCache.get(key);
	if (text === undefined) {
		text = fs.readFileSync(fileName, "utf8");
		textCache.set(key, text);
	}
	return text;
}

function lineOfNode(node: Node) {
	return (
		node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1
	);
}

function lineOfPosition(text: string, position: number) {
	let line = 1;
	for (let i = 0; i < position && i < text.length; i++) {
		if (text.charCodeAt(i) === 10) line++;
	}
	return line;
}

function moduleName(fileName: string) {
	return path.basename(fileName).replace(/\.server\.tsx?$|\.tsx?$/, "");
}

function isAppFile(fileName: string) {
	return fileName
		.toLowerCase()
		.startsWith(path.join(ROOT, "app").toLowerCase());
}

function isTestFile(fileName: string) {
	return /\.test\.tsx?$/.test(fileName);
}

function samePath(a: string, b: string) {
	return a.toLowerCase() === b.toLowerCase();
}

function relative(fileName: string) {
	return path.relative(ROOT.toLowerCase(), fileName.toLowerCase()) ===
		fileName.toLowerCase()
		? fileName
		: fileName.slice(ROOT.length + 1);
}

function truncate(text: string, length = 60) {
	const singleLine = text.replace(/\s+/g, " ");
	return singleLine.length > length
		? `${singleLine.slice(0, length - 1)}…`
		: singleLine;
}

await main();
