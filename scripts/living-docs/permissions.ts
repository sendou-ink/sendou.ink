import fs from "node:fs";
import path from "node:path";
import type { Node } from "oxc-parser";
import * as R from "remeda";
import {
	lineOf,
	type ParsedFile,
	parseFile,
	ROOT,
	textOf,
	walk,
} from "./ast.ts";
import { resolveDeclaration } from "./data-access.ts";
import { featureOfFile } from "./features.ts";
import { isTestFile } from "./modules.ts";
import { resolveImport } from "./source-index.ts";

export const PERMISSIONS_DIR = "app/modules/permissions";
const ROLE_TYPE_FILE = `${PERMISSIONS_DIR}/types.ts`;
const ROLE_MAPPER_FILE = `${PERMISSIONS_DIR}/mapper.server.ts`;
const PERMISSION_UTILS_FILE = `${PERMISSIONS_DIR}/utils.ts`;
/** The helpers of `utils.ts` checking who a user is rather than what they may do. */
const DIRECT_CHECK_FUNCTIONS = new Set([
	"isAdmin",
	"isStaff",
	"isDev",
	"isQa",
	"isSupporter",
]);
const CHECK_FUNCTIONS = new Set([
	"requireRole",
	"useHasRole",
	"requirePermission",
	"useHasPermission",
	"hasPermission",
]);
const PERMISSION_NAME_REGEX = /^[A-Z][A-Z0-9_]*$/;
const MAX_FOLLOW_DEPTH = 4;

export interface RoleDoc {
	name: string;
	/** The comment trailing it in the `Role` union. */
	comment: string;
	/** Source of each `if` condition of `userRoles()` granting it. */
	grantedWhen: string[];
}

export interface PermissionCheck {
	/** The role or permission checked. */
	name: string;
	via:
		| "requireRole"
		| "useHasRole"
		| "roles.includes"
		| "requirePermission"
		| "useHasPermission"
		| "hasPermission";
	/** `shared` for pure checks in files that aren't `.server`, which may run on either side. */
	side: "server" | "client" | "shared";
	/** Source of the checked entity, null for role checks. */
	subject: string | null;
	/**
	 * The feature granting the checked permission: the check's own when it grants one of that name, else
	 * the only feature granting it or the one named by the subject (`artToDelete` → art). Null for role
	 * checks and when that doesn't settle it.
	 */
	grantedIn: string | null;
	file: string;
	line: number;
	feature: string;
}

export interface PermissionGrant {
	name: string;
	/** Source of the user id list, null for a permission only declared by a type. */
	expression: string | null;
	/** The function building the permissions object, or the type declaring it. */
	entity: string;
	kind: "built" | "type";
	/** The function the object is built by when the `permissions` property calls one, e.g. `permissionsOf`. */
	via: string | null;
	/** The type declaring the permissions object (`ScrimPost`), a built one matched by its permission names. Null when no type declares it. */
	object: string | null;
	/** Tells the permissions objects of a feature apart: the type, else the permission names built together. */
	objectKey: string;
	file: string;
	line: number;
	feature: string;
}

export interface CodeSite {
	/** The function called or the property read. */
	name: string;
	code: string;
	file: string;
	line: number;
	feature: string;
}

export interface PermissionsDoc {
	roles: RoleDoc[];
	grants: PermissionGrant[];
	checks: PermissionCheck[];
	/** Calls of `isAdmin`, `isStaff`… outside the permissions module, checking who the user is rather than a role or permission. */
	directChecks: CodeSite[];
	/** `x.permissions.NAME` reads, bypassing `hasPermission` and with it the admin bypass. */
	directReads: CodeSite[];
}

export interface GrantedPermission {
	name: string;
	/** The type of the object it is on, see `PermissionGrant.object`. */
	object: string | null;
	grants: PermissionGrant[];
	/** Every check of it, other features' included. */
	checks: PermissionCheck[];
	directReads: CodeSite[];
}

/** What a feature's permissions page shows. */
export interface FeaturePermissions {
	/** The per-object permissions the feature grants. */
	granted: GrantedPermission[];
	/** Checks in the feature's files of permissions other features grant. */
	borrowed: PermissionCheck[];
	/** Global role checks in the feature's files. */
	roleChecks: PermissionCheck[];
	directChecks: CodeSite[];
	directReads: CodeSite[];
}

/** The part of `doc` about one feature, null when it neither grants nor checks anything. */
export function featurePermissions(
	doc: PermissionsDoc,
	featureId: string,
): FeaturePermissions | null {
	const grants = doc.grants.filter((grant) => grant.feature === featureId);
	const permissionChecks = doc.checks.filter((check) => check.subject !== null);
	const result: FeaturePermissions = {
		granted: [
			...Map.groupBy(
				R.sortBy(grants, (grant) => grant.object ?? ""),
				(grant) => `${grant.objectKey}:${grant.name}`,
			),
		].map(([, objectGrants]) => ({
			name: objectGrants[0].name,
			object: objectGrants[0].object,
			grants: objectGrants,
			checks: permissionChecks.filter(
				(check) =>
					check.grantedIn === featureId &&
					check.name === objectGrants[0].name &&
					checksObject(check, objectGrants[0], grants),
			),
			directReads: doc.directReads.filter(
				(read) =>
					read.feature === featureId && read.name === objectGrants[0].name,
			),
		})),
		borrowed: permissionChecks.filter(
			(check) => check.feature === featureId && check.grantedIn !== featureId,
		),
		roleChecks: doc.checks.filter(
			(check) => check.subject === null && check.feature === featureId,
		),
		directChecks: doc.directChecks.filter((site) => site.feature === featureId),
		directReads: doc.directReads.filter((read) => read.feature === featureId),
	};

	const isEmpty =
		result.granted.length +
			result.borrowed.length +
			result.roleChecks.length +
			result.directChecks.length +
			result.directReads.length ===
		0;

	return isEmpty ? null : result;
}

/** The global roles and per-object permissions of `app/`: how they are granted and where they are checked. */
export function documentPermissions(sourceFiles: string[]): PermissionsDoc {
	const appFiles = sourceFiles.filter(
		(file) =>
			file.startsWith("app/") &&
			!isTestFile(file) &&
			!file.startsWith(`${PERMISSIONS_DIR}/`),
	);
	const roles = rolesOf();
	const roleNames = new Set(roles.map((role) => role.name));

	const doc: PermissionsDoc = {
		roles,
		grants: [],
		checks: [],
		directChecks: [],
		directReads: [],
	};

	for (const file of appFiles) {
		const source = fs.readFileSync(path.join(ROOT, file), "utf8");
		if (!source.includes("permissions") && !source.includes("Role")) {
			continue;
		}

		const parsed = parseFile(file);
		doc.grants.push(...grantsOf(parsed));
		doc.checks.push(...checksOf(parsed, roleNames));
		doc.directChecks.push(...directChecksOf(parsed));
		doc.directReads.push(...directReadsOf(parsed));
	}

	const featuresByName = new Map<string, Set<string>>();
	for (const grant of doc.grants) {
		const features = featuresByName.get(grant.name) ?? new Set();
		features.add(grant.feature);
		featuresByName.set(grant.name, features);
	}
	for (const check of doc.checks) {
		if (check.subject === null) continue;
		const features = featuresByName.get(check.name);
		check.grantedIn = grantingFeature(check, [...(features ?? [])]);
	}

	doc.grants = R.uniqueBy(
		doc.grants,
		(grant) => `${grant.entity}:${grant.name}:${grant.file}:${grant.line}`,
	);
	assignObjects(doc.grants);

	return doc;
}

/** Gives the grants built together the type declaring the same permissions, grouping them by their permission names when none does. */
function assignObjects(grants: PermissionGrant[]) {
	const typesByNames = new Map<string, string>();
	const declared = grants.filter((grant) => grant.kind === "type");
	for (const typeGrants of Map.groupBy(
		declared,
		(grant) => `${grant.feature}:${grant.entity}`,
	).values()) {
		typesByNames.set(
			`${typeGrants[0].feature}:${namesOf(typeGrants)}`,
			typeGrants[0].entity,
		);
		for (const grant of typeGrants) {
			grant.object = grant.entity;
			grant.objectKey = grant.entity;
		}
	}

	const built = grants.filter((grant) => grant.kind === "built");
	for (const objectGrants of Map.groupBy(
		built,
		(grant) => grant.objectKey,
	).values()) {
		const names = namesOf(objectGrants);
		const type = typesByNames.get(`${objectGrants[0].feature}:${names}`);
		for (const grant of objectGrants) {
			grant.object = type ?? null;
			grant.objectKey = type ?? names;
		}
	}
}

function namesOf(grants: PermissionGrant[]) {
	return [...new Set(grants.map((grant) => grant.name))].sort().join(",");
}

/**
 * Whether a check is of the object `grant` is on: when the feature has several objects granting a permission
 * of that name, the one whose type shares the most words with the checked subject (`scrimRequest` → `ScrimPostRequest`).
 */
function checksObject(
	check: PermissionCheck,
	grant: PermissionGrant,
	featureGrants: PermissionGrant[],
) {
	const objects = [
		...new Set(
			featureGrants
				.filter((candidate) => candidate.name === grant.name)
				.map((candidate) => candidate.objectKey),
		),
	];
	if (objects.length === 1) return true;

	const subjectWords = new Set(words(check.subject ?? ""));
	const score = (objectKey: string) => {
		const objectWords = words(objectKey);
		return (
			objectWords.filter((word) => subjectWords.has(word)).length /
			objectWords.length
		);
	};
	const best = Math.max(...objects.map(score));

	return score(grant.objectKey) === best;
}

function words(identifier: string) {
	return identifier
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

function grantingFeature(check: PermissionCheck, features: string[]) {
	if (features.includes(check.feature)) return check.feature;
	if (features.length === 1) return features[0];

	const subject = (check.subject ?? "").toLowerCase();
	const named = features.filter((feature) =>
		subject.includes(feature.replace(/s$/, "")),
	);

	return named.length === 1 ? named[0] : null;
}

function rolesOf(): RoleDoc[] {
	const file = parseFile(ROLE_TYPE_FILE);
	let union: Node | null = null;
	walk(file.program, (node) => {
		if (node.type === "TSTypeAliasDeclaration" && node.id.name === "Role") {
			union = node.typeAnnotation;
			return false;
		}
		return;
	});
	if (!union) throw new Error(`No Role type in ${ROLE_TYPE_FILE}`);

	const grantedWhen = roleGrants();
	const members: Node[] =
		(union as Node).type === "TSUnionType"
			? (union as Extract<Node, { type: "TSUnionType" }>).types
			: [union];

	return members.flatMap((member) => {
		if (
			member.type !== "TSLiteralType" ||
			member.literal.type !== "Literal" ||
			typeof member.literal.value !== "string"
		) {
			return [];
		}
		const name = member.literal.value;

		return {
			name,
			comment: trailingComment(file, member.end),
			grantedWhen: grantedWhen.get(name) ?? [],
		};
	});
}

/** Role → the conditions of `userRoles()` pushing it. */
function roleGrants() {
	const file = parseFile(ROLE_MAPPER_FILE);
	const grants = new Map<string, string[]>();

	walk(file.program, (node) => {
		if (node.type !== "IfStatement") return;

		walk(node.consequent, (inner) => {
			const role = pushedRole(inner);
			if (role) {
				grants.set(role, [
					...(grants.get(role) ?? []),
					textOf(file, node.test),
				]);
			}
			return;
		});
		return false;
	});

	return grants;
}

function pushedRole(node: Node) {
	if (
		node.type !== "CallExpression" ||
		node.callee.type !== "MemberExpression" ||
		node.callee.property.type !== "Identifier" ||
		node.callee.property.name !== "push"
	) {
		return null;
	}

	return stringValue(node.arguments[0]);
}

function grantsOf(file: ParsedFile): PermissionGrant[] {
	const grants: PermissionGrant[] = [];

	walkWithAncestors(file.program, (node, ancestors) => {
		if (
			node.type === "TSPropertySignature" &&
			keyName(node.key) === "permissions" &&
			node.typeAnnotation?.typeAnnotation.type === "TSTypeLiteral"
		) {
			for (const member of node.typeAnnotation.typeAnnotation.members) {
				if (member.type !== "TSPropertySignature") continue;
				const name = keyName(member.key);
				if (!name || !PERMISSION_NAME_REGEX.test(name)) continue;

				grants.push({
					name,
					expression: null,
					entity: enclosingName(ancestors) ?? "(anonymous)",
					kind: "type",
					via: null,
					object: null,
					objectKey: "",
					file: file.path,
					line: lineOf(file, member.start),
					feature: featureOfFile(file.path),
				});
			}
			return;
		}

		if (node.type !== "Property" || keyName(node.key) !== "permissions") {
			return;
		}
		const entity = enclosingName(ancestors) ?? "(anonymous)";
		const base = {
			entity,
			kind: "built" as const,
			object: null,
			objectKey: `${file.path}:${node.start}`,
			feature: featureOfFile(file.path),
		};

		for (const permission of builtPermissions(file, node.value, ancestors, 0)) {
			grants.push({ ...base, ...permission });
		}
	});

	return grants;
}

/** The permissions an object literal (or a function returning one) grants, following spreads and calls. */
function builtPermissions(
	file: ParsedFile,
	node: Node,
	ancestors: Node[],
	depth: number,
): Array<
	Pick<PermissionGrant, "name" | "expression" | "via" | "file" | "line">
> {
	if (depth > MAX_FOLLOW_DEPTH) return [];

	if (node.type === "CallExpression" && node.callee.type === "Identifier") {
		const returned = returnedObjects(file, node.callee.name);

		return returned.flatMap(({ file: calleeFile, object, functionNode }) =>
			builtPermissions(calleeFile, object, [functionNode], depth + 1).map(
				(permission) => ({
					...permission,
					via: permission.via ?? (node.callee as { name: string }).name,
				}),
			),
		);
	}

	if (node.type !== "ObjectExpression") return [];

	return node.properties.flatMap((property) => {
		if (property.type === "SpreadElement") {
			return builtPermissions(file, property.argument, ancestors, depth + 1);
		}
		if (property.type !== "Property") return [];
		const name = keyName(property.key);
		if (!name || !PERMISSION_NAME_REGEX.test(name)) return [];

		const local =
			property.shorthand || property.value.type === "Identifier"
				? localInit(file, ancestors, (property.value as { name: string }).name)
				: null;

		return {
			name,
			expression: local
				? `${(property.value as { name: string }).name} = ${local}`
				: textOf(file, property.value),
			via: null,
			file: file.path,
			line: lineOf(file, property.start),
		};
	});
}

/** The object literals a function returns, the function resolved from where it is called. */
function returnedObjects(file: ParsedFile, name: string) {
	const ref = resolveDeclaration(file.path, name);
	if (!ref) return [];

	const declaringFile = parseFile(ref.file);
	const functionNode = topLevelFunction(declaringFile, ref.name);
	if (!functionNode) return [];

	const objects: Array<{
		file: ParsedFile;
		object: Node;
		functionNode: Node;
	}> = [];
	const body = (functionNode as { body: Node | null }).body;
	if (!body) return objects;
	if (body.type === "ObjectExpression") {
		return [{ file: declaringFile, object: body, functionNode }];
	}

	walk(body, (node) => {
		if (isFunction(node)) return false;
		if (node.type === "ReturnStatement" && node.argument) {
			objects.push({
				file: declaringFile,
				object: node.argument,
				functionNode,
			});
		}
		return;
	});

	return objects;
}

function topLevelFunction(file: ParsedFile, name: string): Node | null {
	for (const statement of file.program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (
			declaration?.type === "FunctionDeclaration" &&
			declaration.id?.name === name
		) {
			return declaration;
		}
		if (declaration?.type === "VariableDeclaration") {
			for (const declarator of declaration.declarations) {
				if (
					declarator.id.type === "Identifier" &&
					declarator.id.name === name &&
					declarator.init &&
					isFunction(declarator.init)
				) {
					return declarator.init;
				}
			}
		}
	}

	return null;
}

/** Source of the initializer of a const named `name` in the innermost function around the node. */
function localInit(file: ParsedFile, ancestors: Node[], name: string) {
	const scope = ancestors.findLast(isFunction);
	if (!scope) return null;

	let init: string | null = null;
	walk(scope, (node) => {
		if (init) return false;
		if (
			node.type === "VariableDeclarator" &&
			node.id.type === "Identifier" &&
			node.id.name === name &&
			node.init
		) {
			init = textOf(file, node.init);
		}
		return;
	});

	return init;
}

function checksOf(file: ParsedFile, roleNames: Set<string>): PermissionCheck[] {
	const checks: PermissionCheck[] = [];
	const isServerFile = file.path.includes(".server.");

	walk(file.program, (node) => {
		if (node.type !== "CallExpression") return;
		const base = {
			file: file.path,
			line: lineOf(file, node.start),
			feature: featureOfFile(file.path),
		};

		if (
			node.callee.type === "Identifier" &&
			CHECK_FUNCTIONS.has(node.callee.name)
		) {
			const via = node.callee.name as PermissionCheck["via"];
			const isRoleCheck = via === "requireRole" || via === "useHasRole";
			const name = stringValue(node.arguments[isRoleCheck ? 0 : 1]);
			if (!name) return;

			checks.push({
				...base,
				name,
				via,
				side: via.startsWith("require")
					? "server"
					: via.startsWith("use")
						? "client"
						: isServerFile
							? "server"
							: "shared",
				subject: isRoleCheck ? null : textOf(file, node.arguments[0]),
				grantedIn: null,
			});
			return;
		}

		const name = stringValue(node.arguments[0]);
		if (
			name &&
			roleNames.has(name) &&
			node.callee.type === "MemberExpression" &&
			node.callee.property.type === "Identifier" &&
			node.callee.property.name === "includes" &&
			node.callee.object.type === "MemberExpression" &&
			node.callee.object.property.type === "Identifier" &&
			node.callee.object.property.name === "roles"
		) {
			checks.push({
				...base,
				name,
				via: "roles.includes",
				side: isServerFile ? "server" : "shared",
				subject: null,
				grantedIn: null,
			});
		}
	});

	return checks;
}

function directChecksOf(file: ParsedFile): CodeSite[] {
	const localNames = new Map<string, string>();
	for (const entry of file.imports) {
		if (
			resolveImport(file.path, entry.moduleRequest.value) !==
			PERMISSION_UTILS_FILE
		) {
			continue;
		}
		for (const specifier of entry.entries) {
			const imported = specifier.importName.name;
			if (imported && DIRECT_CHECK_FUNCTIONS.has(imported)) {
				localNames.set(specifier.localName.value, imported);
			}
		}
	}
	if (localNames.size === 0) return [];

	const sites: CodeSite[] = [];
	walk(file.program, (node) => {
		if (
			node.type === "CallExpression" &&
			node.callee.type === "Identifier" &&
			localNames.has(node.callee.name)
		) {
			sites.push(codeSite(file, node, localNames.get(node.callee.name)!));
		}
		return;
	});

	return sites;
}

function directReadsOf(file: ParsedFile): CodeSite[] {
	const sites: CodeSite[] = [];

	walk(file.program, (node) => {
		if (
			node.type === "MemberExpression" &&
			!node.computed &&
			node.property.type === "Identifier" &&
			PERMISSION_NAME_REGEX.test(node.property.name) &&
			node.object.type === "MemberExpression" &&
			!node.object.computed &&
			node.object.property.type === "Identifier" &&
			node.object.property.name === "permissions"
		) {
			sites.push(codeSite(file, node, node.property.name));
			return false;
		}
		return;
	});

	return sites;
}

function codeSite(file: ParsedFile, node: Node, name: string): CodeSite {
	const line = lineOf(file, node.start);

	return {
		name,
		code: file.source
			.slice(file.lineStarts[line - 1], file.lineStarts[line] ?? undefined)
			.trim(),
		file: file.path,
		line,
		feature: featureOfFile(file.path),
	};
}

/** Like `walk`, with the nodes above the visited one, outermost first. */
function walkWithAncestors(
	root: Node,
	visit: (node: Node, ancestors: Node[]) => void,
) {
	const ancestors: Node[] = [];
	const visitNode = (node: Node) => {
		visit(node, ancestors);
		ancestors.push(node);
		walk(node, (child) => {
			if (child === node) return;
			visitNode(child);
			return false;
		});
		ancestors.pop();
	};
	visitNode(root);
}

/** Name of the innermost named function, method or type around a node. */
function enclosingName(ancestors: Node[]) {
	for (let i = ancestors.length - 1; i >= 0; i--) {
		const node = ancestors[i];
		const parent = ancestors[i - 1];

		if (
			(node.type === "FunctionDeclaration" ||
				node.type === "TSInterfaceDeclaration" ||
				node.type === "TSTypeAliasDeclaration" ||
				node.type === "ClassDeclaration") &&
			node.id
		) {
			return node.id.name;
		}
		if (isFunction(node) && parent) {
			if (
				parent.type === "VariableDeclarator" &&
				parent.id.type === "Identifier"
			) {
				return parent.id.name;
			}
			if (parent.type === "MethodDefinition" || parent.type === "Property") {
				const name = keyName(parent.key);
				if (name) return name;
			}
		}
	}

	return null;
}

function isFunction(node: Node) {
	return (
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression"
	);
}

function keyName(key: Node) {
	if (key.type === "Identifier") return key.name;

	return stringValue(key);
}

function stringValue(node: Node | undefined | null) {
	return node?.type === "Literal" && typeof node.value === "string"
		? node.value
		: null;
}

function trailingComment(file: ParsedFile, offset: number) {
	const comment = file.comments.find(
		(candidate) =>
			candidate.start >= offset &&
			candidate.type === "Line" &&
			!file.source.slice(offset, candidate.start).includes("\n"),
	);

	return comment?.value.trim() ?? "";
}
