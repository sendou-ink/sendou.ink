import type { Node } from "oxc-parser";
import {
	type ApiExchange,
	examplesOf,
	readApiExamples,
} from "./api-examples.ts";
import { lineOf, parseFile } from "./ast.ts";
import { escapeHtml, highlight } from "./highlight.ts";
import { apiTypeAnchor } from "./links.ts";
import type { SourceRef } from "./page-objects.ts";
import {
	declarationRef,
	declaredNames,
	linkTypeReferences,
} from "./type-refs.ts";

export const PUBLIC_API_SCHEMA_FILE = "app/features/api-public/schema.ts";
/** The comment above an endpoint's response (GET) or request body (POST) type, e.g. `/** GET /api/team/{teamId} *\/`. */
const ENDPOINT_COMMENT_REGEX = /^\*\s*(GET|POST)\s+(\/api\/\S+)\s*$/;

export interface ApiEndpoint {
	method: "GET" | "POST";
	/** With its params in braces, e.g. `/api/team/{teamId}`. */
	path: string;
	/** Requests to it the e2e tests made in the last capture, one per status code. */
	examples: ApiExchange[];
}

export interface ApiType {
	name: string;
	/** The endpoints it is the response (GET) or request body (POST) of, none for the types they share. */
	endpoints: ApiEndpoint[];
	/** Its declaration as highlighted HTML, the schema's own types linking to their heading and imported ones hoverable via `refs`. */
	html: string;
	file: string;
	line: number;
	/** What hovering a `data-ref` of `html` shows, by ref id. */
	refs: Map<string, SourceRef>;
}

/** The types of the public API's schema file in declaration order, each with the endpoints its comment names. */
export function documentPublicApi(): ApiType[] {
	const file = parseFile(PUBLIC_API_SCHEMA_FILE);
	const statements = file.program.body;
	const exchanges = readApiExamples();
	const localNames = new Set(
		statements.flatMap((statement) =>
			declaredNames(declarationOf(statement) ?? statement),
		),
	);

	const endpointsByStatement = new Map<Node, ApiEndpoint[]>();
	for (const comment of file.comments) {
		const match =
			comment.type === "Block"
				? comment.value.match(ENDPOINT_COMMENT_REGEX)
				: null;
		if (!match) continue;

		const statement = statements.find(
			(candidate) => candidate.start >= comment.end,
		);
		if (!statement) {
			throw new Error(
				`No type after "${match[1]} ${match[2]}" in ${PUBLIC_API_SCHEMA_FILE}`,
			);
		}

		const endpoint = {
			method: match[1] as ApiEndpoint["method"],
			path: match[2],
		};
		endpointsByStatement.set(statement, [
			...(endpointsByStatement.get(statement) ?? []),
			{ ...endpoint, examples: examplesOf(exchanges, endpoint) },
		]);
	}

	return statements.flatMap((statement) => {
		const declaration = declarationOf(statement);
		if (
			declaration?.type !== "TSInterfaceDeclaration" &&
			declaration?.type !== "TSTypeAliasDeclaration"
		) {
			return [];
		}

		const refs = new Map<string, SourceRef>();
		const html = linkTypeReferences({
			file,
			node: declaration,
			format: highlight,
			link: (name, nameHtml) => {
				if (localNames.has(name)) {
					return `<a href="#${apiTypeAnchor(name)}">${nameHtml}</a>`;
				}

				const ref = declarationRef(file, name);
				if (!ref) return null;

				const id = `${ref.file}:${ref.line}:${ref.title}`;
				refs.set(id, ref);
				return `<span class="ref" data-ref="${escapeHtml(id)}">${nameHtml}</span>`;
			},
		});

		return {
			name: declaration.id.name,
			endpoints: endpointsByStatement.get(statement) ?? [],
			html,
			file: PUBLIC_API_SCHEMA_FILE,
			line: lineOf(file, declaration.start),
			refs,
		};
	});
}

function declarationOf(statement: Node) {
	return statement.type === "ExportNamedDeclaration"
		? statement.declaration
		: statement;
}
