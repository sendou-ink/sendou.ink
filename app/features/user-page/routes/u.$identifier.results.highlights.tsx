import { type ActionFunction, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { FormErrors } from "~/components/FormErrors";
import { SubmitButton } from "~/components/SubmitButton";
import { requireUser } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import {
	HIGHLIGHT_CHECKBOX_NAME,
	HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME,
	UserResultsTable,
} from "~/features/user-page/components/UserResultsTable";
import { normalizeFormFieldArray } from "~/utils/arrays";
import { parseRequestPayload } from "~/utils/remix.server";
import { userResultsPage } from "~/utils/urls";

import { loader } from "../loaders/u.$identifier.results.server";
export { loader };

const editHighlightsActionSchema = z.object({
	[HIGHLIGHT_CHECKBOX_NAME]: z.optional(
		z.union([z.array(z.string()), z.string()]),
	),
	[HIGHLIGHT_TOURNAMENT_CHECKBOX_NAME]: z.optional(
		z.union([z.array(z.string()), z.string()]),
	),
});

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

export default function ResultHighlightsEditPage() {
	const { t } = useTranslation(["common", "user"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Form method="post" className="stack md items-start">
			<h2 className="text-start">{t("user:results.highlights.choose")}</h2>
			<div className="u__results-table-wrapper">
				<fieldset className="u__results-table-highlights">
					<legend>{t("user:results.highlights.explanation")}</legend>
					<UserResultsTable
						id="user-results-highlight-selection"
						results={data.results}
						hasHighlightCheckboxes
					/>
				</fieldset>
			</div>
			<SubmitButton>{t("common:actions.save")}</SubmitButton>
			<FormErrors namespace="user" />
		</Form>
	);
}
