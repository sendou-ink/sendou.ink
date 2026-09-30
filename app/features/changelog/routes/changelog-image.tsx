import { useLoaderData } from "react-router";
import { Main } from "~/components/Main";
import { ChangelogGraphic } from "../components/ChangelogGraphic";
import { loader } from "../loaders/changelog-image.server";

export { loader };

// this page is not accessible in production, its canvas is screenshotted by
// scripts/generate-changelog-image.ts

export default function ChangelogImagePage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<div className="stack sm">
				<h1>Changelog Image</h1>
				<div className="text-sm text-lighter">
					{data.entries.length} entries. Add <code>?since=&lt;sha&gt;</code> to
					only show the entries added after that commit.
				</div>
			</div>
			<div
				data-changelog-entries={JSON.stringify(data.entries)}
				data-changelog-head={data.headSha}
			>
				<ChangelogGraphic date={new Date()} entries={data.entries} />
			</div>
		</Main>
	);
}
