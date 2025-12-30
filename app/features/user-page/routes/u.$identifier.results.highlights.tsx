import { Form, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { FormErrors } from "~/components/FormErrors";
import { SubmitButton } from "~/components/SubmitButton";
import { UserResultsTable } from "~/features/user-page/components/UserResultsTable";
import { action } from "../actions/u.$identifier.results.highlights.server";
import { loader } from "../loaders/u.$identifier.results.server";
import styles from "../user-page.module.css";
export { loader, action };

export default function ResultHighlightsEditPage() {
	const { t } = useTranslation(["common", "user"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div className={styles.highlightsContainer}>
			<Form id="highlights-form" method="post" className="stack md items-start">
				<h2 className="text-start">{t("user:results.highlights.choose")}</h2>
				<div className={styles.resultsTableWrapper}>
					<fieldset className={styles.resultsTableHighlights}>
						<legend>{t("user:results.highlights.explanation")}</legend>
						<UserResultsTable
							id="user-results-highlight-selection"
							results={data.results.value}
							hasHighlightCheckboxes
						/>
					</fieldset>
				</div>
			</Form>
			<div className={styles.highlightsStickyButton}>
				<FormErrors namespace="user" />
				<SubmitButton form="highlights-form">
					{t("common:actions.save")}
				</SubmitButton>
			</div>
		</div>
	);
}
