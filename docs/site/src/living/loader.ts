import path from "node:path";
import type { Loader } from "astro/loaders";
import { z } from "astro/zod";
import { clearCaches, ROOT } from "../../../../scripts/living-docs/ast.ts";

const RELOAD_DEBOUNCE_MS = 300;

/**
 * A collection generated from the repo's files by `entries`, rerun by the dev server when a file
 * under `watch` (repo relative) changes.
 */
export function generatedLoader<T extends object>({
	name,
	watch,
	entries,
}: {
	name: string;
	watch: string[];
	entries: () => Array<{ id: string; data: T }>;
}): Loader {
	const watched = watch.map((relative) => path.join(ROOT, relative));

	return {
		name,
		schema: z.custom<T>(),
		load: async ({ store, watcher, logger, generateDigest }) => {
			const sync = () => {
				clearCaches();
				const generated = entries();
				const ids = new Set(generated.map((entry) => entry.id));

				for (const id of store.keys()) {
					if (!ids.has(id)) store.delete(id);
				}
				for (const { id, data } of generated) {
					store.set({
						id,
						data: { ...data } as Record<string, unknown>,
						digest: generateDigest(JSON.stringify(data, spreadCollections)),
					});
				}
			};

			sync();

			if (!watcher) return;
			watcher.add(watched);

			let timeout: ReturnType<typeof setTimeout> | undefined;
			watcher.on("all", (_event, file) => {
				if (!watched.some((watchedPath) => file.startsWith(watchedPath))) {
					return;
				}

				clearTimeout(timeout);
				timeout = setTimeout(() => {
					try {
						sync();
						logger.info(
							`Regenerated after ${path.relative(ROOT, file)} changed`,
						);
					} catch (error) {
						logger.error(`Regenerating failed: ${error}`);
					}
				}, RELOAD_DEBOUNCE_MS);
			});
		},
	};
}

/** JSON.stringify drops what Maps and Sets hold, which the digest has to see. */
function spreadCollections(_key: string, value: unknown) {
	return value instanceof Map || value instanceof Set ? [...value] : value;
}
