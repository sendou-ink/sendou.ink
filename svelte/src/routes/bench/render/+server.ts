import { error } from "@sveltejs/kit";
import { render } from "svelte/server";
import { getAssociations } from "#lib/features/associations/associations.remote.ts";
import AssociationsPage from "#lib/features/associations/components/AssociationsPage.svelte";
import { requireUser } from "#lib/server/shims/user.server.ts";
import type { RequestHandler } from "./$types";

const DEFAULT_ITERATIONS = 1000;

/**
 * Measurement only (scripts/measure.ts), off unless SVELTE_SLICE_BENCH=true: server-renders the
 * associations page component `n` times with the logged in user's data and reports the time per
 * render, leaving out the request handling, the queries and the app shell around it. One request is
 * one round, so that measure.ts can alternate rounds with the React app's.
 */
export const GET: RequestHandler = async ({ url }) => {
	if (process.env.SVELTE_SLICE_BENCH !== "true") error(404, "Not Found");

	const user = requireUser();
	const associations = await getAssociations();
	const props = { associations, toJoin: null, inviteCode: null, user };
	const iterations = Number(url.searchParams.get("n")) || DEFAULT_ITERATIONS;

	let html = "";
	const startedAt = performance.now();
	for (let i = 0; i < iterations; i++) {
		html = (await render(AssociationsPage, { props })).body;
	}

	return Response.json({
		microsecondsPerRender: ((performance.now() - startedAt) / iterations) * 1000,
		htmlBytes: Buffer.byteLength(html),
	});
};
