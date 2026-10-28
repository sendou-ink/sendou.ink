// the docs site: the handwritten docs of src/content/docs and the living docs generated from the code, see src/content/docs/dev/living-docs.mdx

import path from "node:path";
import { satteri } from "@astrojs/markdown-satteri";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import type { StarlightUserConfig } from "@astrojs/starlight/types";
import { defineConfig } from "astro/config";
import { SHOWCASE_SECTIONS } from "../../app/features/components-showcase/showcase-sections.ts";
import { outlineFeatures } from "../../scripts/living-docs/document.ts";
import { featureViewPath, VIEWS } from "../../scripts/living-docs/links.ts";
import {
	cssModulesLayer,
	hoverOnlyOnHoverDevices,
} from "../../vite-css-plugins.ts";
import { scopeAppStyles } from "./src/plugins/scope-app-styles.ts";

const REPO_URL = "https://github.com/sendou-ink/sendou.ink";
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
/** The app's global stylesheets the components showcase loads, scoped to it by `scopeAppStyles`. */
const SCOPED_APP_STYLES = [
	"normalize.css",
	"common.css",
	"utils.css",
	"flags.css",
].map((file) => path.join(REPO_ROOT, "app/styles", file));

const CASCADE_LAYERS = [
	"starlight.base",
	"starlight.reset",
	"starlight.core",
	"starlight.content",
	"starlight.components",
	"starlight.utils",
	"reset",
	"base",
	"elements",
	"components",
	"features",
	"utilities",
];

const STARLIGHT_SCROLL_CONTAINERS = [
	"html",
	".sidebar-pane",
	".right-sidebar",
	"mobile-starlight-toc .dropdown",
	"site-search .dialog-frame",
	".sl-markdown-content table",
	".expressive-code pre",
];

// the components showcase imports the app's client config (`app/config.ts`), which requires these in a build
process.env.VITE_SITE_DOMAIN ??= "https://sendou.ink";
process.env.VITE_TOURNAMENT_DEFAULT_LOGO ??= "tournament-logo-default.avif";

export default defineConfig({
	site: "https://docs.sendou.ink",
	integrations: [
		react(),
		starlight({
			title: "sendou.ink docs",
			favicon: "/favicon.ico",
			social: [
				{ icon: "github", label: "GitHub", href: REPO_URL },
				{
					icon: "discord",
					label: "Discord",
					href: "https://discord.gg/sendou",
				},
			],
			editLink: { baseUrl: `${REPO_URL}/edit/main/docs/site/` },
			head: [{ tag: "style", content: `@layer ${CASCADE_LAYERS.join(", ")};` }],
			customCss: ["./src/styles/theme.css", "../../app/styles/utils.css"],
			// the feature READMEs are their own collection, shown on the feature pages (see content.config.ts)
			markdown: { processedDirs: ["./src/content/feature-readmes"] },
			components: {
				MarkdownContent: "./src/components/MarkdownContent.astro",
				SocialIcons: "./src/components/SocialIcons.astro",
			},
			sidebar: [
				{
					label: "Contributor docs",
					items: [{ autogenerate: { directory: "dev" } }],
				},
				{
					label: "Project",
					items: [{ autogenerate: { directory: "project" } }],
				},
				{ label: "Guides", items: [{ autogenerate: { directory: "guides" } }] },
				{
					label: "Public API",
					items: [
						{ label: "Overview", slug: "api" },
						{ label: "Endpoints", link: "/api/endpoints/" },
					],
				},
				{
					label: "Reference",
					items: [
						{ label: "Routes", link: "/reference/routes/" },
						{ label: "Database tables", link: "/reference/db-tables/" },
						{ label: "Lint rules", link: "/reference/lint-rules/" },
						{ label: "Permissions", link: "/reference/permissions/" },
						{
							label: "Search params & storage",
							link: "/reference/search-params/",
						},
						{ label: "Background work", link: "/reference/background-work/" },
						{
							label: "Environment variables",
							link: "/reference/env-vars/",
						},
						{ label: "Package scripts", link: "/reference/scripts/" },
					],
				},
				{
					label: "Components",
					collapsed: true,
					items: SHOWCASE_SECTIONS.map((section) => ({
						label: section.title,
						link: `/components/${section.id}/`,
					})),
				},
				{ label: "Features", items: featureSidebar() },
			],
		}),
	],
	vite: {
		plugins: [cssModulesLayer()],
		envPrefix: ["PUBLIC_", "VITE_"],
		// what the app's vite.config.ts defines, read by `app/utils/git-commit.ts`
		define: { __GIT_COMMIT__: JSON.stringify("") },
		css: {
			postcss: {
				plugins: [
					hoverOnlyOnHoverDevices(),
					scopeAppStyles({
						files: SCOPED_APP_STYLES,
						scope: ".app-root",
						globals: { ".scrollbar": STARLIGHT_SCROLL_CONTAINERS },
					}),
				],
			},
		},
		resolve: { tsconfigPaths: true },
	},
	markdown: {
		processor: satteri(),
	},
});

function featureSidebar(): NonNullable<StarlightUserConfig["sidebar"]> {
	return outlineFeatures()
		.filter(({ views }) => views.length > 0)
		.map(({ config, views }) => ({
			label: config.label,
			collapsed: true,
			items: VIEWS.filter((view) => views.includes(view.id)).map((view) => ({
				label: view.label,
				link: `/${featureViewPath(config.id, view.id)}`,
			})),
		}));
}
