import { Form, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { FormErrors } from "~/components/FormErrors";
import { SubmitButton } from "~/components/SubmitButton";
import { UserResultsTable } from "~/features/user-page/components/UserResultsTable";

import { action } from "../actions/u.$identifier.results.highlights.server";
import { loader } from "../loaders/u.$identifier.results.server";
export { loader, action };

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
