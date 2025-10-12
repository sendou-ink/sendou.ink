import { Form, useLoaderData, useSearchParams } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { FormErrors } from "~/components/FormErrors";
import { Pagination } from "~/components/Pagination";
import { SubmitButton } from "~/components/SubmitButton";
import { UserResultsTable } from "~/features/user-page/components/UserResultsTable";

import { action } from "../actions/u.$identifier.results.highlights.server";
import { loader } from "../loaders/u.$identifier.results.server";
export { loader, action };

// xxx: bad approach

export default function ResultHighlightsEditPage() {
	const { t } = useTranslation(["common", "user"]);
	const data = useLoaderData<typeof loader>();
	const [, setSearchParams] = useSearchParams();

	const setPage = (page: number) => {
		setSearchParams({ page: String(page) });
	};

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
				{data.results.pages > 1 ? (
					<Pagination
						currentPage={data.results.currentPage}
						pagesCount={data.results.pages}
						nextPage={() => setPage(data.results.currentPage + 1)}
						previousPage={() => setPage(data.results.currentPage - 1)}
						setPage={setPage}
					/>
				) : null}
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
