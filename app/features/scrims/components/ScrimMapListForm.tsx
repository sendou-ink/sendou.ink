import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { FormField } from "~/form/FormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import type { loader } from "../loaders/scrims.$id.server";
import { submitMapListFormSchema } from "../scrims-schemas";

type SourceValue = "POOL" | "TOURNAMENT" | "FROM_POST";

export function ScrimMapListForm() {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();
	const postTournament = data.post.mapsTournament;
	const isPostAuthorSide = data.mapByMap.viewerSide === "ALPHA";
	const useFromPost = postTournament != null && isPostAuthorSide;
	const defaultSource: SourceValue = useFromPost ? "FROM_POST" : "TOURNAMENT";

	return (
		<div data-testid="scrim-map-list-form">
			<SendouForm
				title={t("scrims:mapByMap.submitListHeading")}
				schema={submitMapListFormSchema}
				submitButtonTestId="submit-map-list-button"
				fullWidth
				defaultValues={{ source: defaultSource }}
			>
				{() => (
					<>
						<SourceField
							postTournamentName={
								useFromPost ? (postTournament?.name ?? null) : null
							}
						/>
						<SourceDependentFields />
					</>
				)}
			</SendouForm>
		</div>
	);
}

function SourceField({
	postTournamentName,
}: {
	postTournamentName: string | null;
}) {
	const { t } = useTranslation(["forms"]);

	const items = postTournamentName
		? [
				{ value: "FROM_POST", label: () => postTournamentName },
				{
					value: "POOL",
					label: () => t("forms:options.scrimMapSource.POOL"),
				},
			]
		: [
				{
					value: "TOURNAMENT",
					label: () => t("forms:options.scrimMapSource.TOURNAMENT"),
				},
				{
					value: "POOL",
					label: () => t("forms:options.scrimMapSource.POOL"),
				},
			];

	return <FormField name="source" options={items} />;
}

function SourceDependentFields() {
	const { values } = useFormFieldContext();
	const source = values.source as SourceValue;

	if (source === "POOL") return <FormField name="serializedPool" />;
	if (source === "TOURNAMENT") return <FormField name="tournamentId" />;
	return null;
}
