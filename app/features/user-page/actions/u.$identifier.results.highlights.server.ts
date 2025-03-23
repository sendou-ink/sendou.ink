import { type ActionFunction, redirect } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	HIGHLIGHT_CHECKBOX_NAME,
	HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME,
} from "~/features/user-page/components/UserResultsTable";
import { normalizeFormFieldArray } from "~/utils/arrays";
import { parseRequestPayload } from "~/utils/remix.server";
import { userResultsPage } from "~/utils/urls";
import { editHighlightsActionSchema } from "../user-page-schemas.server";

export const action: ActionFunction = async ({ request }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: editHighlightsActionSchema,
	});

	const resultTeamIds = normalizeFormFieldArray(
		data[HIGHLIGHT_CHECKBOX_NAME],
	).map((id) => Number.parseInt(id, 10));
	const resultTournamentTeamIds = normalizeFormFieldArray(
		data[HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME],
	).map((id) => Number.parseInt(id, 10));

	await UserRepository.updateResultHighlights({
		userId: user.id,
		resultTeamIds,
		resultTournamentTeamIds,
	});

	throw redirect(userResultsPage(user));
};
