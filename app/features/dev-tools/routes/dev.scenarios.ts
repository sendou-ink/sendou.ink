import type { LoaderFunctionArgs } from "react-router";
import { refreshCaches } from "~/features/api-private/core/refresh-caches.server";
import { defineAction } from "~/form/define-action.server";
import { notFound } from "~/utils/remix.server";
import * as Scenarios from "../core/Scenarios.server";
import { runScenarioSchema } from "../dev-tools-schemas";
import { logInAsUrl } from "../dev-tools-urls";
import { requireDevTools } from "../dev-tools-utils.server";

export type DevScenariosLoaderData = ReturnType<typeof loader>;
export type DevScenarioActionData = Exclude<
	Awaited<ReturnType<typeof action>>,
	{ fieldErrors: unknown }
>;

export const loader = ({ request }: LoaderFunctionArgs) => {
	requireDevTools(request);

	return { scenarios: Scenarios.list() };
};

export const action = defineAction(
	{ body: runScenarioSchema, onInvalidBody: "badRequest" },
	async ({ request, body }) => {
		requireDevTools(request);

		const outcome = await Scenarios.run(body.scenarioId, body.params);
		if (outcome.status === "unknown-scenario") notFound();
		if (outcome.status === "invalid-params") {
			throw Response.json({ error: outcome.message }, { status: 400 });
		}

		await refreshCaches();

		const { result } = outcome;
		return {
			...result,
			logInUrl: logInAsUrl({ userId: result.userId, returnTo: result.path }),
		};
	},
);
