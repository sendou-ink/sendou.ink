import { redirect } from "react-router";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	HIGHLIGHT_CHECKBOX_NAME,
	HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME,
} from "~/features/user-page/user-page-constants";
import { defineAction } from "~/form/define-action.server";
import { userResultsPage } from "~/utils/urls";
import { editHighlightsActionSchema } from "../user-page-schemas";

export const action = defineAction(
	{ body: editHighlightsActionSchema },
	async ({ body }) => {
		const user = requireUser();

		await UserRepository.updateOwnResultHighlights({
			resultTeamIds: body[HIGHLIGHT_CHECKBOX_NAME],
			resultTournamentTeamIds: body[HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME],
		});

		throw redirect(userResultsPage(user));
	},
);
