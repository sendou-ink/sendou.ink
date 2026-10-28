import { BookOpen, Link2 } from "lucide-react";
import { LinkButton } from "~/components/elements/Button";
import { SendouSection } from "~/components/elements/Section";
import type { DevApp } from "../../dev-tools-types";

export const linksDevApp: DevApp = {
	id: "links",
	title: "Links",
	description: "The local docs site and the pages only the dev server has",
	icon: <Link2 />,
	size: "md",
	Component: LinksApp,
};

const LOCAL_DOCS_URL = "http://localhost:4321/";

const DEV_ONLY_PAGES = [
	{ label: "OG images", url: "/admin/og-images" },
	{ label: "Generate images", url: "/admin/generate-images" },
	{ label: "Changelog image", url: "/admin/changelog-image" },
	{ label: "All weapon ranges", url: "/comp-analyzer/all-ranges" },
	{ label: "Bracket test", url: "/bracket-test" },
	{ label: "Match page test", url: "/match-page-test" },
] as const;

function LinksApp() {
	return (
		<div className="stack md">
			<SendouSection
				title="Docs"
				icon={BookOpen}
				action={
					<LinkButton
						to={LOCAL_DOCS_URL}
						isExternal
						variant="outlined"
						size="miniscule"
					>
						Open
					</LinkButton>
				}
			>
				<p className="text-xs text-lighter">
					Served by <code>pnpm run dev:docs</code>, start it first
				</p>
			</SendouSection>

			<SendouSection title="Dev only pages">
				<p className="text-xs text-lighter">
					Registered in the dev only part of <code>routes.ts</code>
				</p>
				<div className="stack horizontal sm flex-wrap">
					{DEV_ONLY_PAGES.map((page) => (
						<LinkButton
							key={page.url}
							to={page.url}
							variant="outlined"
							size="small"
						>
							{page.label}
						</LinkButton>
					))}
				</div>
			</SendouSection>
		</div>
	);
}
