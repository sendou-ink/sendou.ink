import type { Node } from "oxc-parser";
import {
	type JsDoc,
	jsDocOf,
	lineOf,
	type ParsedFile,
	parseFile,
	textOf,
	walk,
} from "./ast.ts";
import {
	type FormSchema,
	formHelpersSchemaName,
	formSchemaOf,
} from "./forms.ts";
import { allSourceFiles } from "./source-index.ts";

const MAX_REF_CODE_LINES = 14;

/** Where something a doc line was generated from is defined, shown when hovering the line. */
export interface SourceRef {
	title: string;
	doc: string | null;
	code: string | null;
	file: string;
	line: number;
}

export interface PageObjectClass {
	ref: SourceRef;
	methods: Map<string, { ref: SourceRef; returnsClass: string | null }>;
	/** Entries of the `this.locators = { … }` object. */
	locators: Map<string, SourceRef>;
	/** `this.form = createFormHelpers(page, schema)` properties → the schema's fields. */
	forms: Map<string, FormSchema>;
}

export interface PageObjectIndex {
	classes: Map<string, PageObjectClass>;
	/** Functions declared by `e2e/helpers`. */
	helpers: Map<string, SourceRef>;
}

/** Page objects (`e2e/pages`) and helpers (`e2e/helpers`) the specs drive the app through. */
export function indexPageObjects(): PageObjectIndex {
	const classes = new Map<string, PageObjectClass>();
	const helpers = new Map<string, SourceRef>();

	const files = allSourceFiles().filter(
		(file) => file.startsWith("e2e/pages/") || file.startsWith("e2e/helpers/"),
	);

	for (const path of files) {
		const file = parseFile(path);

		for (const statement of file.program.body) {
			const declaration =
				statement.type === "ExportNamedDeclaration"
					? statement.declaration
					: statement;
			if (!declaration) continue;

			if (declaration.type === "FunctionDeclaration" && declaration.id) {
				helpers.set(
					declaration.id.name,
					sourceRef(file, declaration.id.name, statement, statement),
				);
			}
			if (declaration.type !== "ClassDeclaration" || !declaration.id) continue;

			const className = declaration.id.name;
			const methods: PageObjectClass["methods"] = new Map();
			const locators: PageObjectClass["locators"] = new Map();
			const forms: PageObjectClass["forms"] = new Map();

			for (const member of declaration.body.body) {
				if (member.type !== "MethodDefinition") continue;
				if (member.key.type !== "Identifier") continue;

				if (member.kind === "constructor") {
					collectLocators(file, className, member, locators);
					collectForms(file, member, forms);
					continue;
				}

				methods.set(member.key.name, {
					ref: sourceRef(
						file,
						`${className}.${member.key.name}`,
						member,
						member,
					),
					returnsClass: returnedClass(member.value),
				});
			}

			classes.set(className, {
				ref: {
					title: className,
					doc: docText(jsDocOf(file, statement.start)),
					code: null,
					file: path,
					line: lineOf(file, statement.start),
				},
				methods,
				locators,
				forms,
			});
		}
	}

	return { classes, helpers };
}

/** A JSDoc's description, null when there's none. */
export function docText(doc: JsDoc | null) {
	return doc?.description ? doc.description : null;
}

/** Ref to a declaration: its JSDoc and (capped) source. */
export function sourceRef(
	file: ParsedFile,
	title: string,
	docAnchor: Node,
	code: Node,
): SourceRef {
	const lines = textOf(file, code).split("\n");

	return {
		title,
		doc: docText(jsDocOf(file, docAnchor.start)),
		code:
			lines.length > MAX_REF_CODE_LINES
				? [...lines.slice(0, MAX_REF_CODE_LINES), "\t// …"].join("\n")
				: lines.join("\n"),
		file: file.path,
		line: lineOf(file, code.start),
	};
}

function collectLocators(
	file: ParsedFile,
	className: string,
	constructorNode: Node,
	locators: PageObjectClass["locators"],
) {
	walk(constructorNode, (node) => {
		if (
			node.type !== "AssignmentExpression" ||
			node.left.type !== "MemberExpression" ||
			node.left.property.type !== "Identifier" ||
			node.left.property.name !== "locators" ||
			node.right.type !== "ObjectExpression"
		) {
			return;
		}

		for (const property of node.right.properties) {
			if (property.type !== "Property" || property.key.type !== "Identifier") {
				continue;
			}
			locators.set(
				property.key.name,
				sourceRef(
					file,
					`${className}.locators.${property.key.name}`,
					property,
					property.value,
				),
			);
		}
		return false;
	});
}

function collectForms(
	file: ParsedFile,
	constructorNode: Node,
	forms: PageObjectClass["forms"],
) {
	walk(constructorNode, (node) => {
		if (
			node.type !== "AssignmentExpression" ||
			node.left.type !== "MemberExpression" ||
			node.left.property.type !== "Identifier"
		) {
			return;
		}

		const schemaName = formHelpersSchemaName(node.right);
		const schema = schemaName ? formSchemaOf(file.path, schemaName) : null;
		if (schema) forms.set(node.left.property.name, schema);
		return;
	});
}

function returnedClass(fn: Node) {
	let className: string | null = null;

	walk(fn, (node) => {
		if (className) return false;
		if (
			node.type === "ReturnStatement" &&
			node.argument?.type === "NewExpression" &&
			node.argument.callee.type === "Identifier"
		) {
			className = node.argument.callee.name;
		}
		return;
	});

	return className;
}
