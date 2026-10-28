import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import {
	getRealUserId,
	isImpersonating,
} from "~/features/auth/core/user.server";
import * as Scenarios from "../core/Scenarios.server";
import * as DevToolsRepository from "../DevToolsRepository.server";
import { QUICK_LOG_IN_USERS } from "../dev-tools-constants";
import { requireDevTools } from "../dev-tools-utils.server";

export type DevIdentityLoaderData = Awaited<ReturnType<typeof loader>>;

export const loader = async ({ request }: LoaderFunctionArgs) => {
	requireDevTools(request);

	const impersonating = await isImpersonating(request);
	const realUserId = impersonating ? await getRealUserId(request) : undefined;
	const scenarioRuns = Scenarios.recentRuns();

	const users = await DevToolsRepository.findAllUsersByIds(
		R.unique([
			...QUICK_LOG_IN_USERS.map((quickUser) => quickUser.id),
			...scenarioRuns.map((run) => run.userId),
			...(realUserId ? [realUserId] : []),
		]),
	);
	const userById = new Map(users.map((row) => [row.id, row]));

	return {
		isImpersonating: impersonating,
		realUser: realUserId ? (userById.get(realUserId) ?? null) : null,
		quickUsers: QUICK_LOG_IN_USERS.flatMap((quickUser) => {
			const row = userById.get(quickUser.id);

			return row ? [{ ...row, label: quickUser.label }] : [];
		}),
		// a reseed deletes the users of earlier runs
		scenarioRuns: scenarioRuns.flatMap((run) => {
			const row = userById.get(run.userId);

			return row ? [{ ...run, user: row }] : [];
		}),
	};
};
