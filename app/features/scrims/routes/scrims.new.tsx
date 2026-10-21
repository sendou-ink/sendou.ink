import { useTranslation } from "react-i18next";
import { type MetaFunction, useLoaderData } from "react-router";
import type * as v from "valibot";
import {
	BaseVisibilityFormField,
	NotFoundVisibilityFormField,
} from "~/features/associations/components/VisibilityFormFields";
import type { CustomFieldRenderProps } from "~/form";
import { FormField as UntypedFormField } from "~/form/FormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { nullFilledArray } from "~/utils/arrays";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { Main } from "../../../components/Main";
import { action } from "../actions/scrims.new.server";
import { ScrimSchedulePicker } from "../components/ScrimSchedulePicker";
import { WithFormField } from "../components/WithFormField";
import { loader } from "../loaders/scrims.new.server";
import { SCRIM } from "../scrims-constants";
import { scrimsNewFormSchema } from "../scrims-schemas";

export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "New scrim post",
		image: ogPageImage("scrims"),
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["scrims", "schedule"],
};

type FormFields = v.InferOutput<typeof scrimsNewFormSchema>;

export default function NewScrimPage() {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();

	const defaultTeam =
		data.teams.find((team) => team.isMainTeam) ?? data.teams[0];

	return (
		<Main>
			<SendouForm
				schema={scrimsNewFormSchema}
				title={t("scrims:forms.title")}
				defaultValues={{
					postText: "",
					at: new Date(),
					rangeEnd: null,
					baseVisibility: "PUBLIC",
					notFoundVisibility: { at: null, forAssociation: "PUBLIC" },
					from: defaultTeam
						? { mode: "TEAM", teamId: defaultTeam.id }
						: {
								mode: "PICKUP",
								users: nullFilledArray(
									SCRIM.MAX_PICKUP_SIZE_EXCLUDING_OWNER,
								) as unknown as number[],
							},
					managedByAnyone: true,
					maps: "NO_PREFERENCE",
					mapsTournamentId: null,
				}}
			>
				{({ FormField }) => (
					<>
						<FormField name="from">
							{(props: CustomFieldRenderProps) => (
								<WithFormField
									usersTeams={data.teams}
									recentPickupRosters={data.recentPickupRosters}
									{...props}
								/>
							)}
						</FormField>

						<SchedulePicker />

						<FormField name="at" />
						<FormField name="rangeEnd" />

						<FormField name="baseVisibility">
							{(props: CustomFieldRenderProps) => (
								<BaseVisibilityFormField
									associations={data.associations}
									{...props}
								/>
							)}
						</FormField>

						<NotFoundVisibilityFormField associations={data.associations} />

						<FormField name="divs" />

						<FormField name="maps" />

						<MapsTournamentFormField />

						<FormField name="postText" />

						<FormField name="managedByAnyone" />
					</>
				)}
			</SendouForm>
		</Main>
	);
}

function SchedulePicker() {
	const data = useLoaderData<typeof loader>();
	const { values, setValue } = useFormFieldContext();

	const from = values.from as FormFields["from"] | null;
	if (!from) return null;

	return (
		<ScrimSchedulePicker
			schedule={data.schedule}
			scheduleUsers={data.scheduleUsers}
			teams={data.teams}
			from={from}
			at={values.at as Date | undefined}
			onPick={({ at, rangeEnd }) => {
				setValue("at", at);
				setValue("rangeEnd", rangeEnd);
			}}
		/>
	);
}

function MapsTournamentFormField() {
	const { values } = useFormFieldContext();

	if (values.maps !== "TOURNAMENT") return null;

	return <UntypedFormField name="mapsTournamentId" />;
}
