import fs from "node:fs";
import path from "node:path";
import type { Expression, Node } from "oxc-parser";
import {
	createCache,
	lineOf,
	type ParsedFile,
	parseFile,
	ROOT,
	textOf,
	walk,
} from "./ast.ts";
import type { SourceRef } from "./page-objects.ts";
import { resolveImport } from "./source-index.ts";

const FORMS_TRANSLATIONS = "locales/en/forms.json";
const COMMON_TRANSLATIONS = "locales/en/common.json";

export interface FormField {
	/** The label users see, null when the field has none. */
	label: string | null;
	/** Option value → the label users see. */
	items: Map<string, string>;
	ref: SourceRef;
}

export type FormSchema = Map<string, FormField>;

const TRANSLATION_FILES = {
	forms: FORMS_TRANSLATIONS,
	common: COMMON_TRANSLATIONS,
};

const cache = createCache<string, FormSchema | null>();
const translations = createCache<string, Record<string, string>>();

/** Fields of the SendouForm schema `schemaName` as imported (or declared) in `fromFile`, with their English labels. */
export function formSchemaOf(
	fromFile: string,
	schemaName: string,
): FormSchema | null {
	const declaringFile = declaringFileOf(fromFile, schemaName);
	if (!declaringFile) return null;

	const key = `${declaringFile}:${schemaName}`;
	if (!cache.has(key)) {
		cache.set(key, parseSchema(parseFile(declaringFile), schemaName));
	}

	return cache.get(key)!;
}

/** The schema identifier of a `createFormHelpers(page, schema)` call, null for anything else. */
export function formHelpersSchemaName(node: Node | null | undefined) {
	if (
		node?.type !== "CallExpression" ||
		node.callee.type !== "Identifier" ||
		node.callee.name !== "createFormHelpers"
	) {
		return null;
	}
	const schema = node.arguments[1];

	return schema?.type === "Identifier" ? schema.name : null;
}

function declaringFileOf(fromFile: string, name: string) {
	const file = parseFile(fromFile);
	for (const entry of file.imports) {
		const imported = entry.entries.find(
			(specifier) => specifier.localName.value === name,
		);
		if (imported) return resolveImport(fromFile, entry.moduleRequest.value);
	}

	return fromFile;
}

function parseSchema(file: ParsedFile, schemaName: string): FormSchema | null {
	const init = constInit(file, schemaName);
	if (!init) return null;

	let entries: Node | null = null;
	walk(init, (node) => {
		if (entries) return false;
		if (
			node.type === "CallExpression" &&
			node.callee.type === "MemberExpression" &&
			node.callee.property.type === "Identifier" &&
			node.callee.property.name === "object" &&
			node.arguments[0]?.type === "ObjectExpression"
		) {
			entries = node.arguments[0];
		}
		return;
	});
	if (!entries) return null;

	const schema: FormSchema = new Map();
	for (const property of (
		entries as Extract<Node, { type: "ObjectExpression" }>
	).properties) {
		if (property.type !== "Property" || property.key.type !== "Identifier") {
			continue;
		}

		const options =
			property.value.type === "CallExpression"
				? property.value.arguments.find(
						(arg) => arg.type === "ObjectExpression",
					)
				: undefined;
		const label = stringProperty(options, "label");

		schema.set(property.key.name, {
			label: label ? translate(`forms:${label}`) : null,
			items: itemLabels(file, propertyValue(options, "items")),
			ref: {
				title: `${schemaName}.${property.key.name}`,
				doc: label ? `Label: \`forms:${label}\`` : null,
				code: textOf(file, property),
				file: file.path,
				line: lineOf(file, property.start),
			},
		});
	}

	return schema;
}

function itemLabels(file: ParsedFile, items: Node | null) {
	const labels = new Map<string, string>();

	for (const element of arrayElements(file, items)) {
		const itemValue = stringProperty(element, "value");
		const label = stringProperty(element, "label");
		if (itemValue !== null && label) {
			labels.set(itemValue, translate(`forms:${label}`));
		}
	}

	return labels;
}

function arrayElements(file: ParsedFile, node: Node | null): Node[] {
	const unwrapped = node ? unwrap(node as Expression) : null;
	if (!unwrapped) return [];

	if (unwrapped.type === "Identifier") {
		const declared = constInit(file, unwrapped.name);
		return arrayElements(file, declared);
	}
	if (unwrapped.type !== "ArrayExpression") return [];

	return unwrapped.elements.flatMap((element) => {
		if (!element) return [];
		if (element.type === "SpreadElement") {
			return arrayElements(file, element.argument);
		}
		return [element];
	});
}

function constInit(file: ParsedFile, name: string): Node | null {
	for (const statement of file.program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (declaration?.type !== "VariableDeclaration") continue;

		for (const declarator of declaration.declarations) {
			if (declarator.id.type === "Identifier" && declarator.id.name === name) {
				return declarator.init;
			}
		}
	}

	return null;
}

function propertyValue(node: Node | null | undefined, key: string) {
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

function stringProperty(node: Node | null | undefined, key: string) {
	const value = propertyValue(node, key);
	const unwrapped = value ? unwrap(value) : null;

	return unwrapped?.type === "Literal" && typeof unwrapped.value === "string"
		? unwrapped.value
		: null;
}

function unwrap(node: Expression): Expression {
	if (
		node.type === "TSAsExpression" ||
		node.type === "TSSatisfiesExpression" ||
		node.type === "ParenthesizedExpression"
	) {
		return unwrap(node.expression);
	}
	return node;
}

function translate(key: string) {
	const [namespace, translationKey] = key.split(":") as [
		keyof typeof TRANSLATION_FILES,
		string,
	];
	const file = TRANSLATION_FILES[namespace];
	if (!file) return translationKey;

	if (!translations.has(file)) translations.set(file, readTranslations(file));
	return translations.get(file)![translationKey] ?? translationKey;
}

function readTranslations(file: string): Record<string, string> {
	return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
}
