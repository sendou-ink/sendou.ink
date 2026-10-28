import { defineCollection } from "astro:content";
import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";
import { glob } from "astro/loaders";
import { API_EXAMPLES_FILE } from "../../../scripts/living-docs/api-examples.ts";
import { documentBackgroundWork } from "../../../scripts/living-docs/background-work.ts";
import { documentClientState } from "../../../scripts/living-docs/client-state.ts";
import { documentDbTables } from "../../../scripts/living-docs/db-tables.ts";
import { documentFeatures } from "../../../scripts/living-docs/document.ts";
import { documentEnvVars } from "../../../scripts/living-docs/env-vars.ts";
import { documentLintRules } from "../../../scripts/living-docs/lint-rules.ts";
import { documentPackageScripts } from "../../../scripts/living-docs/package-scripts.ts";
import { documentPermissions } from "../../../scripts/living-docs/permissions.ts";
import {
	documentPublicApi,
	PUBLIC_API_SCHEMA_FILE,
} from "../../../scripts/living-docs/public-api.ts";
import { documentShowcase } from "../../../scripts/living-docs/showcase.ts";
import { allSourceFiles } from "../../../scripts/living-docs/source-index.ts";
import {
	SCREENSHOTS_DIR,
	VISITS_FILE,
} from "../../../scripts/living-docs/visits.ts";
import { generatedLoader } from "./living/loader.ts";

export const collections = {
	docs: defineCollection({
		loader: docsLoader(),
		schema: docsSchema(),
	}),
	// Starlight reads it for UI string overrides, an empty one keeps Astro from warning it is missing
	i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
	features: defineCollection({
		loader: generatedLoader({
			name: "living-docs",
			watch: ["app", "e2e", "locales/en", VISITS_FILE, SCREENSHOTS_DIR],
			entries: () =>
				documentFeatures().map((feature) => ({
					id: feature.config.id,
					data: feature,
				})),
		}),
	}),
	featureReadmes: defineCollection({
		loader: glob({ base: "./src/content/feature-readmes", pattern: "*.mdx" }),
	}),
	showcase: defineCollection({
		loader: generatedLoader({
			name: "showcase",
			watch: ["app"],
			entries: () =>
				documentShowcase(allSourceFiles()).map((section) => ({
					id: section.id,
					data: section,
				})),
		}),
	}),
	dbTables: defineCollection({
		loader: generatedLoader({
			name: "db-tables",
			watch: ["app/db/tables.ts", "migrations"],
			entries: () =>
				documentDbTables().map((table) => ({ id: table.name, data: table })),
		}),
	}),
	publicApi: defineCollection({
		loader: generatedLoader({
			name: "public-api",
			watch: [PUBLIC_API_SCHEMA_FILE, API_EXAMPLES_FILE],
			entries: () =>
				documentPublicApi().map((type) => ({ id: type.name, data: type })),
		}),
	}),
	backgroundWork: defineCollection({
		loader: generatedLoader({
			name: "background-work",
			watch: ["app", "locales/en/common.json"],
			entries: () => [
				{ id: "background-work", data: documentBackgroundWork() },
			],
		}),
	}),
	clientState: defineCollection({
		loader: generatedLoader({
			name: "client-state",
			watch: ["app"],
			entries: () =>
				documentClientState(allSourceFiles()).map((definition) => ({
					id: `${definition.file}#${definition.name}`,
					data: definition,
				})),
		}),
	}),
	permissions: defineCollection({
		loader: generatedLoader({
			name: "permissions",
			watch: ["app"],
			entries: () => [
				{ id: "permissions", data: documentPermissions(allSourceFiles()) },
			],
		}),
	}),
	envVars: defineCollection({
		loader: generatedLoader({
			name: "env-vars",
			watch: [
				".env.example",
				"app",
				"scripts",
				"e2e",
				"docs/site/astro.config.ts",
			],
			entries: () =>
				documentEnvVars().map((envVar) => ({ id: envVar.name, data: envVar })),
		}),
	}),
	packageScripts: defineCollection({
		loader: generatedLoader({
			name: "package-scripts",
			watch: ["package.json", "scripts"],
			entries: () =>
				documentPackageScripts().map((script) => ({
					id: script.name,
					data: script,
				})),
		}),
	}),
	lintRules: defineCollection({
		loader: generatedLoader({
			name: "lint-rules",
			watch: ["biome-plugins", "biome.json"],
			entries: () =>
				documentLintRules().map((rule) => ({ id: rule.name, data: rule })),
		}),
	}),
};
