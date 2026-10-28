import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Node } from "oxc-parser";
import { ensureMigratedDb } from "../ensure-test-db.ts";
import {
	createCache,
	jsDocOf,
	lineOf,
	type ParsedFile,
	parseFile,
	textOf,
} from "./ast.ts";
import { escapeHtml } from "./highlight.ts";
import { docText, type SourceRef } from "./page-objects.ts";
import { declarationRef, linkTypeReferences } from "./type-refs.ts";

const TABLES_FILE = "app/db/tables.ts";
const DB_INTERFACE = "DB";
/** Wrap nearly every column's type without saying anything about it. */
const UNREFERENCED_TYPES = new Set(["Generated"]);
/** Database the migrations are applied to for reading the foreign keys, kept between runs to skip migrating again. */
const SCHEMA_DB_PATH = path.join(
	os.tmpdir(),
	"sendou-living-docs-schema.sqlite3",
);

export interface DbColumn {
	name: string;
	type: string;
	/** `type` as HTML, its enums, JSON shapes and other named types hoverable via `refs`. */
	typeHtml: string;
	doc: string | null;
	line: number;
	/** The table its foreign key points to. */
	references: string | null;
}

/** A foreign key of the migrated schema. */
export interface DbRelation {
	/** The table holding the foreign key. */
	from: string;
	column: string;
	/** The table it points to. */
	to: string;
	nullable: boolean;
	/** At most one row of `from` per row of `to`. */
	unique: boolean;
	/** e.g. `CASCADE`, `SET NULL` or `NO ACTION`. */
	onDelete: string;
}

export interface DbTable {
	/** Table (or view) name, a key of the `DB` interface. */
	name: string;
	/** The table it is grouped under: the longest other table name it starts with, e.g. `AllTeam` for `AllTeamMember`. */
	parent: string | null;
	doc: string | null;
	/** The interface describing its rows, shared by tables and views of the same rows. */
	rowType: string;
	file: string;
	line: number;
	columns: DbColumn[];
	/** Foreign keys of this table. */
	references: DbRelation[];
	/** Foreign keys of other tables pointing to this one. */
	referencedBy: DbRelation[];
	/** For a view, the tables it selects from. */
	viewOf: string[] | null;
	/** What hovering a `data-ref` of the column types shows, by ref id. */
	refs: Map<string, SourceRef>;
}

/** Every table and view of the `DB` interface (`app/db/tables.ts`) with its columns and their JSDoc, and its relations read from the migrated schema. */
export function documentDbTables(): DbTable[] {
	const file = parseFile(TABLES_FILE);
	const schema = readSchema();
	const interfaces = new Map<string, Node>();

	for (const statement of file.program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (declaration?.type === "TSInterfaceDeclaration") {
			interfaces.set(declaration.id.name, declaration);
		}
	}

	const properties = propertiesOf(dbInterface(file));
	const names = properties.map((property) => propertyName(file, property));

	return properties
		.map((property) => {
			const rowType = typeName(property);
			const rowInterface = rowType ? interfaces.get(rowType) : undefined;
			const tableDoc = docText(jsDocOf(file, property.start));
			const rowDoc =
				rowInterface && rowInterface.type === "TSInterfaceDeclaration"
					? docText(jsDocOf(file, statementStart(file, rowInterface)))
					: null;

			const name = propertyName(file, property);
			const refs = new Map<string, SourceRef>();
			const references = schema.relations.filter(
				(relation) => relation.from === name,
			);

			return {
				name,
				parent: prefixParent(name, names),
				doc: tableDoc ?? rowDoc,
				rowType: rowType ?? "",
				file: TABLES_FILE,
				line: rowInterface
					? lineOf(file, rowInterface.start)
					: lineOf(file, property.start),
				columns:
					rowInterface && rowInterface.type === "TSInterfaceDeclaration"
						? propertiesOf(rowInterface).map((column) => {
								const type = column.typeAnnotation?.typeAnnotation;

								return {
									name: propertyName(file, column),
									type: type ? textOf(file, type) : "",
									typeHtml: type ? typeHtml(file, type, refs) : "",
									doc: docText(jsDocOf(file, column.start)),
									line: lineOf(file, column.start),
									references:
										references.find(
											(relation) =>
												relation.column === propertyName(file, column),
										)?.to ?? null,
								};
							})
						: [],
				references,
				referencedBy: schema.relations.filter(
					(relation) => relation.to === name,
				),
				viewOf: schema.views.get(name) ?? null,
				refs,
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

const tableNamesCache = createCache<string, Set<string>>();

/** Names of the tables and views of the `DB` interface, without migrating a database for their relations. */
export function dbTableNames() {
	const cached = tableNamesCache.get(TABLES_FILE);
	if (cached) return cached;

	const file = parseFile(TABLES_FILE);
	const names = new Set(
		propertiesOf(dbInterface(file)).map((property) =>
			propertyName(file, property),
		),
	);
	tableNamesCache.set(TABLES_FILE, names);

	return names;
}

function dbInterface(file: ParsedFile) {
	for (const statement of file.program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (
			declaration?.type === "TSInterfaceDeclaration" &&
			declaration.id.name === DB_INTERFACE
		) {
			return declaration;
		}
	}

	throw new Error(`No ${DB_INTERFACE} interface in ${TABLES_FILE}`);
}

function readSchema() {
	ensureMigratedDb(SCHEMA_DB_PATH);
	const db = new DatabaseSync(SCHEMA_DB_PATH, { readOnly: true });

	try {
		const objects = db
			.prepare(
				"select name, type, sql from sqlite_master where type in ('table', 'view') and name not like 'sqlite_%'",
			)
			.all() as Array<{ name: string; type: "table" | "view"; sql: string }>;

		const relations = objects
			.filter((object) => object.type === "table")
			.flatMap(({ name }) => tableRelations(db, name))
			.sort(
				(a, b) =>
					a.from.localeCompare(b.from) || a.column.localeCompare(b.column),
			);

		const views = new Map(
			objects
				.filter((object) => object.type === "view")
				.map(({ name, sql }) => [name, selectedTables(sql, name)]),
		);

		return { relations, views };
	} finally {
		db.close();
	}
}

function tableRelations(db: DatabaseSync, table: string): DbRelation[] {
	const columns = db.prepare(`pragma table_info("${table}")`).all() as Array<{
		name: string;
		notnull: number;
		pk: number;
	}>;
	const uniqueColumns = new Set(
		(
			db.prepare(`pragma index_list("${table}")`).all() as Array<{
				name: string;
				unique: number;
			}>
		)
			.filter((index) => index.unique === 1)
			.map(
				(index) =>
					db.prepare(`pragma index_info("${index.name}")`).all() as Array<{
						name: string;
					}>,
			)
			.filter((indexColumns) => indexColumns.length === 1)
			.map(([column]) => column.name),
	);
	const primaryKey = columns.filter((column) => column.pk > 0);
	if (primaryKey.length === 1) uniqueColumns.add(primaryKey[0].name);

	const foreignKeys = db
		.prepare(`pragma foreign_key_list("${table}")`)
		.all() as Array<{ table: string; from: string; on_delete: string }>;

	return foreignKeys.map((foreignKey) => ({
		from: table,
		column: foreignKey.from,
		to: foreignKey.table,
		nullable:
			columns.find((column) => column.name === foreignKey.from)?.notnull !== 1,
		unique: uniqueColumns.has(foreignKey.from),
		onDelete: foreignKey.on_delete,
	}));
}

/** Tables (or views) a view's SQL selects from or joins. */
function selectedTables(sql: string, view: string) {
	const names = [...sql.matchAll(/\b(?:from|join)\s+"?(\w+)"?/gi)].map(
		(match) => match[1],
	);

	return [...new Set(names)].filter((name) => name !== view);
}

function prefixParent(name: string, names: string[]) {
	const candidates = names.filter(
		(candidate) =>
			candidate !== name &&
			name.startsWith(candidate) &&
			/[A-Z]/.test(name.charAt(candidate.length)),
	);

	return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

function typeHtml(file: ParsedFile, type: Node, refs: Map<string, SourceRef>) {
	return linkTypeReferences({
		file,
		node: type,
		format: escapeHtml,
		link: (name, html) => {
			const ref = UNREFERENCED_TYPES.has(name)
				? null
				: declarationRef(file, name);
			if (!ref) return null;

			const id = `${ref.file}:${ref.line}:${ref.title}`;
			refs.set(id, ref);
			return `<span class="ref" data-ref="${escapeHtml(id)}">${html}</span>`;
		},
	});
}

type PropertySignature = Extract<Node, { type: "TSPropertySignature" }>;

function propertiesOf(
	declaration: Extract<Node, { type: "TSInterfaceDeclaration" }>,
) {
	return declaration.body.body.filter(
		(member): member is PropertySignature =>
			member.type === "TSPropertySignature",
	);
}

function propertyName(file: ParsedFile, property: PropertySignature) {
	return property.key.type === "Identifier"
		? property.key.name
		: textOf(file, property.key);
}

function typeName(property: PropertySignature) {
	const type = property.typeAnnotation?.typeAnnotation;
	if (type?.type === "TSTypeReference" && type.typeName.type === "Identifier") {
		return type.typeName.name;
	}

	return null;
}

/** Where an interface's JSDoc sits above: the `export` keyword when exported. */
function statementStart(file: ParsedFile, declaration: Node) {
	const exported = file.program.body.find(
		(statement) =>
			statement.type === "ExportNamedDeclaration" &&
			statement.declaration === declaration,
	);

	return exported?.start ?? declaration.start;
}
