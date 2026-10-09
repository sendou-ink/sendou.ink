/**
 * Dev-only resource route backing the Fixtures tab: without params it lists
 * every fixture with its expected.json, with params it serves the raw frame
 * bytes. Registered under devOnlyRoutes — the corpus only exists in a checkout.
 */
import { readdirSync, readFileSync } from "node:fs";
import type { LoaderFunctionArgs } from "react-router";
import { notFound, notFoundIfNullish } from "~/utils/remix.server";
import { FIXTURES_DIR, type Fixture, loadFixtures } from "../node/fixtures";

export interface FixtureListItem {
	detector: string;
	name: string;
	expected: Fixture["expected"];
}

const PATH_SEGMENT_RE = /^[\w.-]+$/;

export const loader = ({ params }: LoaderFunctionArgs) => {
	const { detector, caseName } = params;
	if (!detector) return Response.json({ fixtures: listAllFixtures() });
	if (
		!PATH_SEGMENT_RE.test(detector) ||
		!caseName ||
		!PATH_SEGMENT_RE.test(caseName)
	) {
		notFound();
	}

	const fixture = notFoundIfNullish(
		loadFixtures(detector).find((f) => f.name === caseName),
	);

	return new Response(new Uint8Array(readFileSync(fixture.framePath)), {
		headers: {
			"Content-Type": fixture.framePath.endsWith(".png")
				? "image/png"
				: fixture.framePath.endsWith(".webp")
					? "image/webp"
					: "image/jpeg",
			"Cache-Control": "no-cache",
		},
	});
};

function listAllFixtures(): FixtureListItem[] {
	return readdirSync(FIXTURES_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) =>
			loadFixtures(entry.name).map((fixture) => ({
				detector: entry.name,
				name: fixture.name,
				expected: fixture.expected,
			})),
		);
}
