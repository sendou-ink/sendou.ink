import { useTranslation } from "react-i18next";
import { Form, useLoaderData } from "react-router";
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
		<div className="u__highlights-container">
			<Form id="highlights-form" method="post" className="stack md items-start">
				<h2 className="text-start">{t("user:results.highlights.choose")}</h2>
				<div className="u__results-table-wrapper">
					<fieldset className="u__results-table-highlights">
						<legend>{t("user:results.highlights.explanation")}</legend>
						<UserResultsTable
							id="user-results-highlight-selection"
							results={data.results.value}
							hasHighlightCheckboxes
						/>
					</fieldset>
				</div>
			</Form>
			<div className="u__highlights-sticky-button">
				<FormErrors namespace="user" />
				<SubmitButton form="highlights-form">
					{t("common:actions.save")}
				</SubmitButton>
			</div>
		</div>
	);
}
