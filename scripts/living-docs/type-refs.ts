import type { Node } from "oxc-parser";
import { type ParsedFile, parseFile, textOf, walk } from "./ast.ts";
import { type SourceRef, sourceRef } from "./page-objects.ts";
import { resolveImport } from "./source-index.ts";

/**
 * A node's source as HTML, each named type it references replaced by what `link` makes of it
 * (given its name and formatted text), or left as is when `link` returns null.
 */
export function linkTypeReferences({
	file,
	node,
	format,
	link,
}: {
	file: ParsedFile;
	node: Node;
	format: (code: string) => string;
	link: (name: string, html: string) => string | null;
}) {
	const references: Array<{ start: number; end: number; name: string }> = [];
	walk(node, (child) => {
		const identifier =
			child.type === "TSTypeReference"
				? child.typeName
				: child.type === "TSTypeQuery"
					? child.exprName
					: null;
		if (identifier?.type === "Identifier") {
			references.push({
				start: identifier.start,
				end: identifier.end,
				name: identifier.name,
			});
		}
		return;
	});

	let html = "";
	let cursor = node.start;
	for (const { start, end, name } of references.sort(
		(a, b) => a.start - b.start,
	)) {
		const linked = link(name, format(file.source.slice(start, end)));
		if (linked === null) continue;

		html += `${format(file.source.slice(cursor, start))}${linked}`;
		cursor = end;
	}

	return html + format(file.source.slice(cursor, node.end));
}

/** Where the type or const `name` of `file` is declared, following imports and re-exports. */
export function declarationRef(
	file: ParsedFile,
	name: string,
): SourceRef | null {
	for (const statement of file.program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (declaration && declaredNames(declaration).includes(name)) {
			return withQueriedValues(
				file,
				declaration,
				sourceRef(file, name, statement, statement),
			);
		}
	}

	for (const entry of file.imports) {
		const specifier = entry.entries.find(
			(candidate) => candidate.localName.value === name,
		);
		if (!specifier) continue;

		const resolved = resolveImport(file.path, entry.moduleRequest.value);
		return resolved && specifier.importName.name
			? declarationRef(parseFile(resolved), specifier.importName.name)
			: null;
	}

	for (const statement of file.program.body) {
		if (statement.type !== "ExportNamedDeclaration" || !statement.source) {
			continue;
		}
		const specifier = statement.specifiers.find(
			(candidate) => textOf(file, candidate.exported) === name,
		);
		if (!specifier) continue;

		const resolved = resolveImport(file.path, statement.source.value);
		return resolved
			? declarationRef(parseFile(resolved), textOf(file, specifier.local))
			: null;
	}

	return null;
}

export function declaredNames(declaration: Node) {
	switch (declaration.type) {
		case "TSTypeAliasDeclaration":
		case "TSInterfaceDeclaration":
		case "TSEnumDeclaration":
			return [declaration.id.name];
		case "VariableDeclaration":
			return declaration.declarations.flatMap((declarator) =>
				declarator.id.type === "Identifier" ? [declarator.id.name] : [],
			);
		default:
			return [];
	}
}

/** Appends the code of the consts a type is derived from, e.g. the array of `(typeof ROLES)[number]`. */
function withQueriedValues(
	file: ParsedFile,
	declaration: Node,
	ref: SourceRef,
): SourceRef {
	if (declaration.type !== "TSTypeAliasDeclaration") return ref;

	const queried: SourceRef[] = [];
	walk(declaration.typeAnnotation, (node) => {
		if (node.type === "TSTypeQuery" && node.exprName.type === "Identifier") {
			const value = declarationRef(file, node.exprName.name);
			if (value) queried.push(value);
		}
		return;
	});

	return queried.length > 0
		? {
				...ref,
				code: [ref.code, ...queried.map((value) => value.code)].join("\n\n"),
			}
		: ref;
}
