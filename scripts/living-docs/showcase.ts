import type { Node } from "oxc-parser";
import { type ParsedFile, parseFile, textOf, walk } from "./ast.ts";
import { isTestFile } from "./modules.ts";
import { resolveImport, type Usage, usagesOf } from "./source-index.ts";

const SHOWCASE_FILE =
	"app/features/components-showcase/components/ShowcaseSections.tsx";
const SHOWCASE_DIR = "app/features/components-showcase/";
const SECTION_COMPONENTS = "SECTION_COMPONENTS";
const EXAMPLE_ELEMENT = "ComponentRow";

export interface ShowcaseComponent {
	name: string;
	file: string;
	/** Where the app uses it, the showcase and tests left out. */
	usages: Usage[];
}

export interface ShowcaseSectionDoc {
	id: string;
	/** `<ComponentRow>` label → the source of its example, with the local components it renders. */
	examples: Record<string, string>;
	/** The app's components the section shows. */
	components: ShowcaseComponent[];
}

/** Every section of the components showcase: the source of its examples and where the components it shows are used. */
export function documentShowcase(sourceFiles: string[]): ShowcaseSectionDoc[] {
	const file = parseFile(SHOWCASE_FILE);
	const functions = topLevelFunctions(file);
	const imports = importedNames(file);
	const usagesByFile = new Map<string, Usage[]>();

	const usagesOfComponent = (componentFile: string, name: string) => {
		if (!usagesByFile.has(componentFile)) {
			usagesByFile.set(
				componentFile,
				usagesOf(componentFile, sourceFiles).filter(
					(usage) =>
						!isTestFile(usage.file) && !usage.file.startsWith(SHOWCASE_DIR),
				),
			);
		}

		return usagesByFile
			.get(componentFile)!
			.filter((usage) => usage.exportName === name);
	};

	return sectionComponents(file).map(({ id, functionName }) => {
		const sectionFunction = functions.get(functionName);
		if (!sectionFunction) return { id, examples: {}, components: [] };

		const rendered = renderedNames(sectionFunction, functions);
		const components = [...rendered]
			.map((name) => ({ name, imported: imports.get(name) }))
			.filter(({ imported }) => imported !== undefined)
			.map(({ name, imported }) => ({
				name: imported!.importedName,
				file: resolveImport(SHOWCASE_FILE, imported!.specifier),
				localName: name,
			}))
			.filter(
				(component): component is typeof component & { file: string } =>
					component.file !== null && !component.file.startsWith(SHOWCASE_DIR),
			)
			.map(({ name, file: componentFile }) => ({
				name,
				file: componentFile,
				usages: usagesOfComponent(componentFile, name),
			}))
			.sort((a, b) => a.name.localeCompare(b.name));

		return {
			id,
			examples: examplesOf(file, sectionFunction, functions),
			components,
		};
	});
}

function sectionComponents(file: ParsedFile) {
	const sections: Array<{ id: string; functionName: string }> = [];

	walk(file.program, (node) => {
		if (
			node.type !== "VariableDeclarator" ||
			node.id.type !== "Identifier" ||
			node.id.name !== SECTION_COMPONENTS ||
			node.init?.type !== "ObjectExpression"
		) {
			return;
		}

		for (const property of node.init.properties) {
			if (
				property.type !== "Property" ||
				property.value.type !== "Identifier"
			) {
				continue;
			}
			const id =
				property.key.type === "Identifier"
					? property.key.name
					: property.key.type === "Literal"
						? String(property.key.value)
						: null;
			if (id) sections.push({ id, functionName: property.value.name });
		}
		return false;
	});

	return sections;
}

function topLevelFunctions(file: ParsedFile) {
	const functions = new Map<string, Node>();
	for (const statement of file.program.body) {
		const declaration =
			statement.type === "ExportNamedDeclaration"
				? statement.declaration
				: statement;
		if (declaration?.type === "FunctionDeclaration" && declaration.id) {
			functions.set(declaration.id.name, declaration);
		}
	}

	return functions;
}

function importedNames(file: ParsedFile) {
	const names = new Map<string, { specifier: string; importedName: string }>();
	for (const entry of file.imports) {
		for (const specifier of entry.entries) {
			if (specifier.isType || specifier.importName.kind !== "Name") continue;
			names.set(specifier.localName.value, {
				specifier: entry.moduleRequest.value,
				importedName: specifier.importName.name ?? specifier.localName.value,
			});
		}
	}

	return names;
}

/** Names of the JSX elements `node` renders, following the file's own components. */
function renderedNames(
	node: Node,
	functions: Map<string, Node>,
	seen = new Set<string>(),
) {
	const names = new Set<string>();

	walk(node, (child) => {
		if (child.type !== "JSXOpeningElement") return;
		if (child.name.type !== "JSXIdentifier") return;

		const name = child.name.name;
		names.add(name);
		const localFunction = functions.get(name);
		if (localFunction && !seen.has(name)) {
			seen.add(name);
			for (const nested of renderedNames(localFunction, functions, seen)) {
				names.add(nested);
			}
		}
		return;
	});

	return names;
}

function examplesOf(
	file: ParsedFile,
	sectionFunction: Node,
	functions: Map<string, Node>,
) {
	const examples: Record<string, string> = {};

	walk(sectionFunction, (node) => {
		if (
			node.type !== "JSXElement" ||
			node.openingElement.name.type !== "JSXIdentifier" ||
			node.openingElement.name.name !== EXAMPLE_ELEMENT
		) {
			return;
		}

		const label = labelOf(node.openingElement);
		const children = node.children.filter(
			(child) => child.type !== "JSXText" || child.value.trim() !== "",
		);
		if (!label || children.length === 0 || examples[label] !== undefined) {
			return false;
		}

		const helpers = [...renderedNames(node, functions)]
			.filter((name) => name !== EXAMPLE_ELEMENT && functions.has(name))
			.map((name) => textOf(file, functions.get(name)!));
		examples[label] = [
			textOf(file, { start: children[0].start, end: children.at(-1)!.end }),
			...helpers,
		].join("\n\n");

		return false;
	});

	return examples;
}

function labelOf(openingElement: Node) {
	if (openingElement.type !== "JSXOpeningElement") return null;

	for (const attribute of openingElement.attributes) {
		if (
			attribute.type === "JSXAttribute" &&
			attribute.name.type === "JSXIdentifier" &&
			attribute.name.name === "label" &&
			attribute.value?.type === "Literal" &&
			typeof attribute.value.value === "string"
		) {
			return attribute.value.value;
		}
	}

	return null;
}
