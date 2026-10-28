// what runs without a user clicking anything: the scheduled routines, the endpoints called by machines and the notifications sent, see docs/site/src/content/docs/dev/living-docs.mdx

import fs from "node:fs";
import path from "node:path";
import type { Node } from "oxc-parser";
import { appRoutes } from "./app-routes.ts";
import {
	jsDocOf,
	lineOf,
	type ParsedFile,
	parseFile,
	ROOT,
	textOf,
	walk,
} from "./ast.ts";
import {
	type DeclarationRef,
	reachableTables,
	resolveDeclaration,
	traceDeclaration,
} from "./data-access.ts";
import type { RouteDataTrace } from "./document.ts";
import { allSourceFiles, usagesOf } from "./source-index.ts";

const ENTRY_SERVER_FILE = "app/entry.server.tsx";
const ROUTINES_LIST_FILE = "app/routines/list.server.ts";
const DISCORD_WEBHOOK_FILE = "app/modules/discord-webhook.server.ts";
const NOTIFICATION_TYPES_FILE =
	"app/features/notifications/notifications-types.ts";
const NOTIFICATION_UTILS_FILE =
	"app/features/notifications/notifications-utils.ts";
const NOTIFY_FILE = "app/features/notifications/core/notify.server.ts";
const TRANSLATIONS_FILE = "locales/en/common.json";
const WEEKDAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
/** Checks of a loader or action that make it an endpoint for machines rather than users. */
const ENDPOINT_GUARDS = [
	{ auth: "lohi", pattern: /\bcanAccessLohiEndpoint\(/ },
	{
		auth: "dev-controls",
		pattern:
			/if \(!DANGEROUS_CAN_ACCESS_DEV_CONTROLS\) \{\s*(?:badRequest|forbidden|notFound)\(/,
	},
] as const;

export interface Routine {
	/** The `name` given to `new Routine`, what `/run-routine` takes. */
	name: string;
	exportName: string;
	file: string;
	line: number;
	/** Its JSDoc, or the comment at the top of its file. */
	description: string | null;
	/** What its function reads and writes, through the repository functions it calls. */
	data: RouteDataTrace;
	/** Notification types its file sends. */
	notificationTypes: string[];
}

export interface CronSchedule {
	/** e.g. `30 * /1 * * *` */
	expression: string;
	/** The expression in words, e.g. "Every hour at :30". */
	reading: string;
	/** The `timezone` option, null for the server's own. */
	timezone: string | null;
	/** The comment above the `cron.schedule` call. */
	comment: string | null;
	line: number;
	/** The export of `list.server.ts` the schedule runs. */
	list: string;
	listDoc: string | null;
	routines: Routine[];
}

export interface InternalEndpoint {
	/** e.g. `/api/voice/webhook` */
	path: string;
	file: string;
	/** Who calls it: the Lohi bot and cron jobs (`Lohi-Token` header), a third party's webhook or the dev tools and e2e tests. */
	auth: "lohi" | "webhook" | "dev-controls";
	description: string | null;
	handlers: Array<{ method: "GET" | "POST"; data: RouteDataTrace }>;
}

export interface CallSite {
	file: string;
	line: number;
	/** The top-level declaration the call is made in. */
	declaration: string;
	/** Routes served by the file, empty when it is not a loader or action. */
	routes: Array<{ path: string; file: string }>;
	/** Name of the routine whose file it is. */
	routine: string | null;
}

export interface OutboundWebhook {
	/** e.g. `sendModDiscordWebhook` */
	name: string;
	file: string;
	line: number;
	doc: string | null;
	/** The environment variable holding the webhook's URL. */
	envVar: string | null;
	/** The functions building a message for it and where they are called. */
	senders: Array<{
		name: string;
		file: string;
		line: number;
		doc: string | null;
		callers: CallSite[];
	}>;
}

export interface NotificationType {
	type: string;
	line: number;
	/** The values its title and text interpolate, with their types. */
	meta: Array<{ name: string; type: string }>;
	title: string | null;
	text: string | null;
	/** One of `NAV_ICONS`, the icon shown next to it. */
	navIcon: string | null;
	/** Source of the expression `notificationLink` returns for it. */
	link: string | null;
	/** Web push urgency. */
	urgency: string | null;
	senders: CallSite[];
}

export interface BackgroundWork {
	schedules: CronSchedule[];
	endpoints: InternalEndpoint[];
	outboundWebhooks: OutboundWebhook[];
	notificationTypes: NotificationType[];
}

/** The routines cron runs, the endpoints machines call, the Discord webhooks posted to and the notification types sent. */
export function documentBackgroundWork(): BackgroundWork {
	const sourceFiles = allSourceFiles();
	const routesByHandlerFile = routesOfHandlerFiles();
	const routineNamesByFile = new Map<string, string>();
	const notificationSenders = notifyCallSites(sourceFiles);

	const schedules = cronSchedules().map((schedule) => ({
		...schedule,
		routines: schedule.routines.map((ref) => {
			const routine = documentRoutine(ref);
			routineNamesByFile.set(routine.file, routine.name);
			return {
				...routine,
				notificationTypes: [
					...new Set(
						notificationSenders
							.filter((sender) => sender.site.file === routine.file)
							.map((sender) => sender.type),
					),
				],
			};
		}),
	}));

	const callSite = (
		file: string,
		line: number,
		declaration: string,
	): CallSite => ({
		file,
		line,
		declaration,
		routes: routesByHandlerFile.get(file) ?? [],
		routine: routineNamesByFile.get(file) ?? null,
	});

	return {
		schedules,
		endpoints: internalEndpoints(),
		outboundWebhooks: outboundWebhooks(sourceFiles, callSite),
		notificationTypes: notificationTypes().map((notification) => ({
			...notification,
			senders: uniqueBy(
				notificationSenders.filter(
					(sender) => sender.type === notification.type,
				),
				({ site }) => `${site.file}#${site.declaration}`,
			).map(({ site }) => callSite(site.file, site.line, site.declaration)),
		})),
	};
}

function cronSchedules() {
	const file = parseFile(ENTRY_SERVER_FILE);
	const lists = routineLists();
	const schedules: Array<
		Omit<CronSchedule, "routines"> & { routines: DeclarationRef[] }
	> = [];

	walk(file.program, (node) => {
		if (node.type !== "ExpressionStatement") return;
		const call = node.expression;
		if (
			call.type !== "CallExpression" ||
			call.callee.type !== "MemberExpression" ||
			call.callee.object.type !== "Identifier" ||
			call.callee.object.name !== "cron" ||
			call.callee.property.type !== "Identifier" ||
			call.callee.property.name !== "schedule"
		) {
			return;
		}

		const [expressionArg, callback, options] = call.arguments;
		const expression = stringValue(expressionArg) ?? "";
		const timezone =
			options?.type === "ObjectExpression"
				? (stringValue(propertyValue(options, "timezone")) ?? null)
				: null;

		let listName: string | null = null;
		if (callback) {
			walk(callback as Node, (inner) => {
				if (
					inner.type === "ForOfStatement" &&
					inner.right.type === "Identifier"
				) {
					listName = inner.right.name;
				}
				return;
			});
		}
		const list = listName ? lists.get(listName) : undefined;

		schedules.push({
			expression,
			reading: readCron(expression),
			timezone,
			comment: lineCommentAbove(file, node.start),
			line: lineOf(file, node.start),
			list: listName ?? "",
			listDoc: list?.doc ?? null,
			routines: list?.routines ?? [],
		});
		return false;
	});

	return schedules;
}

/** The exported arrays of `list.server.ts`, each routine resolved to its declaration. */
function routineLists() {
	const file = parseFile(ROUTINES_LIST_FILE);
	const lists = new Map<
		string,
		{ doc: string | null; routines: DeclarationRef[] }
	>();

	for (const statement of file.program.body) {
		if (
			statement.type !== "ExportNamedDeclaration" ||
			statement.declaration?.type !== "VariableDeclaration"
		) {
			continue;
		}

		for (const declarator of statement.declaration.declarations) {
			if (
				declarator.id.type !== "Identifier" ||
				declarator.init?.type !== "ArrayExpression"
			) {
				continue;
			}

			lists.set(declarator.id.name, {
				doc: jsDocOf(file, statement.start)?.description || null,
				routines: declarator.init.elements.flatMap((element) =>
					element?.type === "Identifier"
						? [resolveDeclaration(file.path, element.name)].filter(
								(ref): ref is DeclarationRef => ref !== null,
							)
						: [],
				),
			});
		}
	}

	return lists;
}

function documentRoutine(
	ref: DeclarationRef,
): Omit<Routine, "notificationTypes"> {
	const file = parseFile(ref.file);
	const statement = file.program.body.find(
		(candidate) =>
			candidate.type === "ExportNamedDeclaration" &&
			candidate.declaration?.type === "VariableDeclaration" &&
			candidate.declaration.declarations.some(
				(declarator) =>
					declarator.id.type === "Identifier" &&
					declarator.id.name === ref.name,
			),
	);

	let name = ref.name;
	if (statement) {
		walk(statement, (node) => {
			if (
				node.type === "NewExpression" &&
				node.callee.type === "Identifier" &&
				node.callee.name === "Routine" &&
				node.arguments[0]?.type === "ObjectExpression"
			) {
				name = stringValue(propertyValue(node.arguments[0], "name")) ?? name;
				return false;
			}
			return;
		});
	}

	return {
		name,
		exportName: ref.name,
		file: ref.file,
		line: statement ? lineOf(file, statement.start) : 1,
		description:
			(statement ? jsDocOf(file, statement.start)?.description : null) ||
			fileComment(file),
		data: dataTrace(ref),
	};
}

/** Loaders and actions guarded for machines (`canAccessLohiEndpoint`, dev controls) and routes with `webhook` in their path. */
function internalEndpoints() {
	const endpoints: InternalEndpoint[] = [];

	for (const route of appRoutes()) {
		const handlers = (
			[
				["GET", "loader", route.hasLoader],
				["POST", "action", route.hasAction],
			] as const
		).flatMap(([method, exportName, exists]) => {
			const ref = exists ? resolveDeclaration(route.file, exportName) : null;
			return ref ? [{ method, ref }] : [];
		});

		const sources = handlers.map(({ ref }) => declarationSource(ref));
		// pages guard some of their actions too, e.g. impersonating on /admin, but are for users
		const auth = route.path.includes("webhook")
			? "webhook"
			: route.hasComponent
				? undefined
				: ENDPOINT_GUARDS.find(({ pattern }) =>
						sources.some((source) => pattern.test(source)),
					)?.auth;
		if (!auth) continue;

		const file = parseFile(route.file);
		endpoints.push({
			path: route.path,
			file: route.file,
			auth,
			description:
				handlers
					.map(({ ref }) => declarationDoc(ref))
					.find((doc) => doc !== null) ?? fileComment(file),
			handlers: handlers.map(({ method, ref }) => ({
				method,
				data: dataTrace(ref),
			})),
		});
	}

	const order = ["lohi", "webhook", "dev-controls"];
	return endpoints.sort(
		(a, b) =>
			order.indexOf(a.auth) - order.indexOf(b.auth) ||
			a.path.localeCompare(b.path),
	);
}

/** The exported functions of `discord-webhook.server.ts` posting to a webhook URL of an environment variable, followed through the feature functions wrapping them. */
function outboundWebhooks(
	sourceFiles: string[],
	callSite: (file: string, line: number, declaration: string) => CallSite,
) {
	const file = parseFile(DISCORD_WEBHOOK_FILE);
	const usages = usagesOf(DISCORD_WEBHOOK_FILE, sourceFiles);
	const webhooks: OutboundWebhook[] = [];

	for (const statement of file.program.body) {
		if (
			statement.type !== "ExportNamedDeclaration" ||
			statement.declaration?.type !== "FunctionDeclaration" ||
			!statement.declaration.id
		) {
			continue;
		}
		const envVar = textOf(file, statement.declaration).match(
			/sendDiscordWebhook\(\s*"(\w+)"/,
		)?.[1];
		if (!envVar) continue;

		const name = statement.declaration.id.name;
		const senderFiles = [
			...new Set(
				usages
					.filter((usage) => usage.exportName === name)
					.map((usage) => usage.file),
			),
		];

		webhooks.push({
			name,
			file: file.path,
			line: lineOf(file, statement.start),
			doc: jsDocOf(file, statement.start)?.description || null,
			envVar,
			senders: senderFiles.flatMap((senderFile) =>
				exportedFunctionsCalling(parseFile(senderFile), name).map((sender) => ({
					...sender,
					file: senderFile,
					callers: [
						...new Set(
							usagesOf(senderFile, sourceFiles)
								.filter((usage) => usage.exportName === sender.name)
								.map((usage) => usage.file),
						),
					].flatMap((callerFile) =>
						callsIn(parseFile(callerFile), sender.name).map((call) =>
							callSite(callerFile, call.line, call.declaration),
						),
					),
				})),
			),
		});
	}

	return webhooks;
}

/** The members of the `Notification` union with their meta, translations, icon, link and urgency. */
function notificationTypes(): Array<Omit<NotificationType, "senders">> {
	const file = parseFile(NOTIFICATION_TYPES_FILE);
	const translations = JSON.parse(
		fs.readFileSync(path.join(ROOT, TRANSLATIONS_FILE), "utf8"),
	) as Record<string, string>;
	const navIcons = switchReturns(
		NOTIFICATION_UTILS_FILE,
		"notificationNavIcon",
	);
	const links = switchReturns(NOTIFICATION_UTILS_FILE, "notificationLink");
	const urgencies = objectLiteralValues(NOTIFY_FILE, "NOTIFICATION_URGENCY");

	const union = file.program.body
		.map((statement) =>
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement,
		)
		.find(
			(declaration) =>
				declaration?.type === "TSTypeAliasDeclaration" &&
				declaration.id.name === "Notification",
		);
	if (union?.type !== "TSTypeAliasDeclaration") {
		throw new Error(`No Notification type in ${NOTIFICATION_TYPES_FILE}`);
	}

	const members =
		union.typeAnnotation.type === "TSUnionType"
			? union.typeAnnotation.types
			: [union.typeAnnotation];

	return members.flatMap((member) => {
		if (member.type !== "TSTypeReference") return [];
		const [typeArg, metaArg] = member.typeArguments?.params ?? [];
		const type =
			typeArg?.type === "TSLiteralType"
				? stringValue(typeArg.literal as Node)
				: undefined;
		if (!type) return [];

		return {
			type,
			line: lineOf(file, member.start),
			meta:
				metaArg?.type === "TSTypeLiteral"
					? metaArg.members.flatMap((property) =>
							property.type === "TSPropertySignature" &&
							property.key.type === "Identifier" &&
							property.typeAnnotation
								? {
										name: property.key.name,
										type: textOf(file, property.typeAnnotation.typeAnnotation),
									}
								: [],
						)
					: [],
			title: translations[`notifications.title.${type}`] ?? null,
			text: translations[`notifications.text.${type}`] ?? null,
			navIcon: navIcons.get(type) ?? null,
			link: oneLine(links.get(type) ?? null),
			urgency: urgencies.get(type) ?? null,
		};
	});
}

/** Every `notify(…)` call and the notification types of the object literals it is given, a `notification` variable followed to its declaration. */
function notifyCallSites(sourceFiles: string[]) {
	const sites: Array<{
		type: string;
		site: { file: string; line: number; declaration: string };
	}> = [];

	for (const filePath of sourceFiles) {
		if (
			!filePath.startsWith("app/") ||
			filePath === NOTIFY_FILE ||
			/\.test\.tsx?$/.test(filePath)
		) {
			continue;
		}
		const source = fs.readFileSync(path.join(ROOT, filePath), "utf8");
		if (!source.includes("notify(")) continue;

		const file = parseFile(filePath);
		for (const statement of file.program.body) {
			walk(statement, (node) => {
				if (
					node.type !== "CallExpression" ||
					node.callee.type !== "Identifier" ||
					node.callee.name !== "notify"
				) {
					return;
				}

				const types = new Set<string>();
				for (const argument of node.arguments) {
					collectTypeLiterals(argument as Node, types);
					const notification =
						argument.type === "ObjectExpression"
							? propertyValue(argument, "notification")
							: null;
					if (notification?.type === "Identifier") {
						const declarator = variableDeclarator(statement, notification.name);
						if (declarator?.init) collectTypeLiterals(declarator.init, types);
					}
				}

				const site = {
					file: filePath,
					line: lineOf(file, node.start),
					declaration: declarationName(statement),
				};
				for (const type of types) sites.push({ type, site });
				return false;
			});
		}
	}

	return sites;
}

/** Repo relative files declaring a loader or action → the routes they serve. */
function routesOfHandlerFiles() {
	const byFile = new Map<string, Array<{ path: string; file: string }>>();
	for (const route of appRoutes()) {
		for (const name of ["loader", "action"]) {
			const declaration = resolveDeclaration(route.file, name);
			if (!declaration) continue;
			const routes = byFile.get(declaration.file) ?? [];
			if (!routes.some((existing) => existing.path === route.path)) {
				byFile.set(declaration.file, [
					...routes,
					{ path: route.path, file: route.file },
				]);
			}
		}
	}

	return byFile;
}

function dataTrace(ref: DeclarationRef): RouteDataTrace {
	const trace = traceDeclaration(ref);

	return {
		file: ref.file,
		line: trace.line,
		tables: trace.tables,
		calls: trace.repositoryCalls.map((call) => ({
			...call,
			tables: reachableTables({ file: call.repository, name: call.name }),
		})),
	};
}

function readCron(expression: string) {
	const [minute, hour, dayOfMonth, month, weekday] = expression.split(/\s+/);
	const everyMinutes = minute.match(/^\*\/(\d+)$/)?.[1];
	const isNumber = (field: string) => /^\d+$/.test(field);
	const time = () => `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

	if (dayOfMonth !== "*" || month !== "*") return expression;
	if (everyMinutes && hour === "*" && weekday === "*") {
		return `Every ${everyMinutes} minutes`;
	}
	if (isNumber(minute) && (hour === "*" || hour === "*/1") && weekday === "*") {
		return `Every hour at :${minute.padStart(2, "0")}`;
	}
	if (isNumber(minute) && isNumber(hour) && weekday === "*") {
		return `Every day at ${time()}`;
	}
	if (isNumber(minute) && isNumber(hour) && isNumber(weekday)) {
		return `Every ${WEEKDAYS[Number(weekday) % 7]} at ${time()}`;
	}

	return expression;
}

/** The `//` lines directly above a statement, joined. */
function lineCommentAbove(file: ParsedFile, start: number) {
	const lines: string[] = [];
	let boundary = start;

	for (const comment of [...file.comments].reverse()) {
		if (comment.end > boundary) continue;
		if (
			comment.type !== "Line" ||
			file.source.slice(comment.end, boundary).trim() !== ""
		) {
			break;
		}
		lines.unshift(comment.value.trim());
		boundary = comment.start;
	}

	return lines.length > 0 ? lines.join(" ") : null;
}

/** The `//` comment at the top of a file, before its imports. */
function fileComment(file: ParsedFile) {
	const firstStatement = file.program.body[0];
	const lines = file.comments
		.filter(
			(comment) =>
				comment.type === "Line" &&
				(!firstStatement || comment.end <= firstStatement.start),
		)
		.map((comment) => comment.value.trim())
		.filter((line) => !line.startsWith("biome-ignore"));

	return lines.length > 0 ? lines.join(" ") : null;
}

function declarationSource(ref: DeclarationRef) {
	const file = parseFile(ref.file);
	const statement = file.program.body.find(
		(candidate) => declarationName(candidate) === ref.name,
	);

	return statement ? textOf(file, statement) : "";
}

function declarationDoc(ref: DeclarationRef) {
	const file = parseFile(ref.file);
	const statement = file.program.body.find(
		(candidate) => declarationName(candidate) === ref.name,
	);

	return (statement && jsDocOf(file, statement.start)?.description) || null;
}

/** Name of the function or variable a top-level statement declares, empty for other statements. */
function declarationName(statement: Node): string {
	const declaration =
		statement.type === "ExportNamedDeclaration" ||
		statement.type === "ExportDefaultDeclaration"
			? statement.declaration
			: statement;
	if (!declaration) return "";

	if (
		(declaration.type === "FunctionDeclaration" ||
			declaration.type === "ClassDeclaration") &&
		declaration.id
	) {
		return declaration.id.name;
	}
	if (declaration.type === "VariableDeclaration") {
		const [first] = declaration.declarations;
		return first?.id.type === "Identifier" ? first.id.name : "";
	}

	return "";
}

/** The calls of `name` (or `Namespace.name`) in a file, one per top-level declaration making them. */
function callsIn(file: ParsedFile, name: string) {
	return file.program.body.flatMap((statement) => {
		let line: number | null = null;
		walk(statement, (node) => {
			if (line !== null) return false;
			if (node.type !== "CallExpression") return;
			const callee = node.callee;
			const calledName =
				callee.type === "Identifier"
					? callee.name
					: callee.type === "MemberExpression" &&
							callee.property.type === "Identifier"
						? callee.property.name
						: null;
			if (calledName === name) line = lineOf(file, node.start);
			return;
		});

		return line === null
			? []
			: [{ line: line as number, declaration: declarationName(statement) }];
	});
}

/** The exported functions of a file that call `callee`. */
function exportedFunctionsCalling(file: ParsedFile, callee: string) {
	return file.program.body.flatMap((statement) => {
		if (statement.type !== "ExportNamedDeclaration") return [];
		const name = declarationName(statement);
		if (!name) return [];

		let calls = false;
		walk(statement, (node) => {
			if (
				node.type === "CallExpression" &&
				node.callee.type === "Identifier" &&
				node.callee.name === callee
			) {
				calls = true;
			}
			return calls ? false : undefined;
		});
		if (!calls) return [];

		return {
			name,
			line: lineOf(file, statement.start),
			doc: jsDocOf(file, statement.start)?.description || null,
		};
	});
}

function collectTypeLiterals(node: Node, types: Set<string>) {
	walk(node, (inner) => {
		if (inner.type !== "Property" || inner.computed) return;
		const key =
			inner.key.type === "Identifier" ? inner.key.name : stringValue(inner.key);
		const value = stringValue(inner.value);
		if (key === "type" && value) types.add(value);
		return;
	});
}

function variableDeclarator(scope: Node, name: string) {
	let found: Extract<Node, { type: "VariableDeclarator" }> | null = null;
	walk(scope, (node) => {
		if (
			node.type === "VariableDeclarator" &&
			node.id.type === "Identifier" &&
			node.id.name === name
		) {
			found = node;
			return false;
		}
		return;
	});

	return found as Extract<Node, { type: "VariableDeclarator" }> | null;
}

/** For a function with a `switch`, each case label → the source of what its branch returns (fallthrough cases sharing it). */
function switchReturns(filePath: string, functionName: string) {
	const file = parseFile(filePath);
	const statement = file.program.body.find(
		(candidate) => declarationName(candidate) === functionName,
	);
	const returns = new Map<string, string>();
	if (!statement) return returns;

	walk(statement, (node) => {
		if (node.type !== "SwitchStatement") return;

		let pending: string[] = [];
		for (const switchCase of node.cases) {
			const label = switchCase.test ? stringValue(switchCase.test) : null;
			if (label) pending.push(label);
			if (switchCase.consequent.length === 0) continue;

			let returned: string | null = null;
			for (const consequent of switchCase.consequent) {
				walk(consequent, (inner) => {
					if (
						returned === null &&
						inner.type === "ReturnStatement" &&
						inner.argument
					) {
						returned = textOf(file, inner.argument);
					}
					return returned === null ? undefined : false;
				});
			}
			if (returned !== null) {
				const literal = (returned as string).match(/^"([^"\\]*)"$/)?.[1];
				for (const pendingLabel of pending) {
					returns.set(pendingLabel, literal ?? returned);
				}
			}
			pending = [];
		}
		return false;
	});

	return returns;
}

/** The string values of a top-level object literal constant, by key. */
function objectLiteralValues(filePath: string, constName: string) {
	const file = parseFile(filePath);
	const statement = file.program.body.find(
		(candidate) => declarationName(candidate) === constName,
	);
	const values = new Map<string, string>();
	if (!statement) return values;

	const declarator = variableDeclarator(statement, constName);
	if (declarator?.init?.type !== "ObjectExpression") return values;

	for (const property of declarator.init.properties) {
		if (property.type !== "Property" || property.key.type !== "Identifier") {
			continue;
		}
		const value = stringValue(property.value);
		if (value) values.set(property.key.name, value);
	}

	return values;
}

function propertyValue(object: Node, key: string) {
	if (object.type !== "ObjectExpression") return null;

	for (const property of object.properties) {
		if (
			property.type === "Property" &&
			!property.computed &&
			((property.key.type === "Identifier" && property.key.name === key) ||
				stringValue(property.key) === key)
		) {
			return property.value as Node;
		}
	}

	return null;
}

function stringValue(node: Node | null | undefined) {
	return node?.type === "Literal" && typeof node.value === "string"
		? node.value
		: undefined;
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
	const seen = new Set<string>();
	return items.filter((item) => {
		const itemKey = key(item);
		if (seen.has(itemKey)) return false;
		seen.add(itemKey);
		return true;
	});
}

/** Multiline source as one line, e.g. a call with an object argument. */
function oneLine(source: string | null) {
	return source === null
		? null
		: source
				.replace(/\s*\n\s*/g, " ")
				.replace(/\( /g, "(")
				.replace(/,? \)/g, ")")
				.replace(/, \}/g, " }");
}
