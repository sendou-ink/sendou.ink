import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./ast.ts";
import {
	mergeTableAccesses,
	type TableAccess,
	traceDeclaration,
} from "./data-access.ts";
import { documentModule, type ExportDoc, type ModuleDoc } from "./modules.ts";
import type { PermissionGrant } from "./permissions.ts";

export interface RepositoryExportDoc extends ExportDoc {
	/** Tables it queries itself, through the repository's private helpers included. */
	tables: TableAccess[];
	/** Functions of other repositories it calls. */
	calls: Array<{ repository: string; name: string }>;
	/** Names of the per-object permissions it builds into what it returns. */
	permissions: string[];
}

export interface RepositoryDoc extends Omit<ModuleDoc, "values"> {
	values: RepositoryExportDoc[];
	/** Every table its functions query. */
	tables: TableAccess[];
	/** Other repositories its functions call. */
	calledRepositories: string[];
}

/** The `*Repository.server.ts` files of a feature folder. */
export function featureRepositoryPaths(featureDir: string) {
	if (!fs.existsSync(path.join(ROOT, featureDir))) return [];

	return fs
		.readdirSync(path.join(ROOT, featureDir))
		.filter((name) => /^[A-Z]\w*Repository\.server\.ts$/.test(name))
		.sort()
		.map((name) => `${featureDir}/${name}`);
}

/** Documentation of a repository: its exports as a module's, each function with the tables it reads and writes. */
export function documentRepository(
	repositoryPath: string,
	sourceFiles: string[],
	routePathsByFile: Map<string, string[]>,
	/** The permissions the repository's feature grants. */
	grants: PermissionGrant[],
): RepositoryDoc {
	const module = documentModule(repositoryPath, sourceFiles, routePathsByFile);
	const values = module.values.map((exported) => {
		const trace = traceDeclaration({
			file: repositoryPath,
			name: exported.name,
		});

		return {
			...exported,
			tables: trace.tables,
			calls: trace.repositoryCalls.map(({ repository, name }) => ({
				repository,
				name,
			})),
			permissions: [
				...new Set(
					grants
						.filter(
							(grant) =>
								grant.kind === "built" && grant.entity === exported.name,
						)
						.map((grant) => grant.name),
				),
			],
		};
	});

	return {
		...module,
		values,
		tables: mergeTableAccesses(values.flatMap((exported) => exported.tables)),
		calledRepositories: [
			...new Set(
				values.flatMap((exported) =>
					exported.calls.map((call) => call.repository),
				),
			),
		].sort(),
	};
}
