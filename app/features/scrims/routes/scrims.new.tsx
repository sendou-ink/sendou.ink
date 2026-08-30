import type { CalendarDateTime } from "@internationalized/date";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { type MetaFunction, useLoaderData } from "react-router";
import type * as v from "valibot";
import { SendouDatePicker } from "~/components/elements/DatePicker";
import { Label } from "~/components/Label";
import type { CustomFieldRenderProps } from "~/form";
import { FormField } from "~/form/FormField";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { errorMessageId } from "~/form/utils";
import { nullFilledArray } from "~/utils/arrays";
import { dateToDateValue } from "~/utils/dates";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { FormMessage } from "../../../components/FormMessage";
import { Main } from "../../../components/Main";
import { action } from "../actions/scrims.new.server";
import { ScrimSchedulePicker } from "../components/ScrimSchedulePicker";
import { WithFormField } from "../components/WithFormField";
import { loader, type ScrimsNewLoaderData } from "../loaders/scrims.new.server";
import { SCRIM } from "../scrims-constants";
import { scrimsNewFormSchema } from "../scrims-schemas";
import styles from "./scrims.new.module.css";

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

const DEFAULT_NOT_FOUND_VISIBILITY = {
	at: null,
	forAssociation: "PUBLIC",
} as const;

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
					notFoundVisibility: DEFAULT_NOT_FOUND_VISIBILITY,
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

function BaseVisibilityFormField({
	associations,
	name,
	value,
	onChange,
	error,
}: {
	associations: ScrimsNewLoaderData["associations"];
	name: string;
	value: unknown;
	onChange: (value: unknown) => void;
	error: string | undefined;
}) {
	const { t } = useTranslation(["scrims"]);
	const id = React.useId();

	const noAssociations =
		associations.virtual.length === 0 && associations.actual.length === 0;

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={t("scrims:forms.visibility.title")}
			error={error}
		>
			{noAssociations ? (
				<FormMessage type="info">
					{t("scrims:forms.visibility.noneAvailable")}
				</FormMessage>
			) : (
				<AssociationSelect
					associations={associations}
					id={id}
					value={String(value)}
					onChange={(e) => onChange(e.target.value)}
				/>
			)}
		</FormFieldWrapper>
	);
}

function NotFoundVisibilityFormField({
	associations,
}: {
	associations: ScrimsNewLoaderData["associations"];
}) {
	const { t } = useTranslation(["scrims", "forms"]);
	const { values, setValue, clientErrors, serverErrors } =
		useFormFieldContext();
	const baseVisibility = values.baseVisibility as string;
	const notFoundVisibility =
		values.notFoundVisibility as FormFields["notFoundVisibility"];

	const prevBaseVisibility = React.useRef(baseVisibility);
	if (prevBaseVisibility.current !== baseVisibility) {
		prevBaseVisibility.current = baseVisibility;
		if (baseVisibility === "PUBLIC") {
			setValue("notFoundVisibility", DEFAULT_NOT_FOUND_VISIBILITY);
		}
	}

	const error =
		serverErrors.notFoundVisibility ?? clientErrors.notFoundVisibility;

	const noAssociations =
		associations.virtual.length === 0 && associations.actual.length === 0;

	if (noAssociations || baseVisibility === "PUBLIC") return null;

	const handleDateChange = (val: CalendarDateTime | null) => {
		if (val) {
			const date = new Date(
				val.year,
				val.month - 1,
				val.day,
				val.hour,
				val.minute,
			);
			setValue("notFoundVisibility", {
				...notFoundVisibility,
				at: date,
			});
		} else {
			setValue("notFoundVisibility", {
				...notFoundVisibility,
				at: null,
			});
		}
	};

	const handleAssociationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		setValue("notFoundVisibility", {
			...notFoundVisibility,
			forAssociation: e.target.value,
		});
	};

	const dateValue = notFoundVisibility.at
		? dateToDateValue(new Date(notFoundVisibility.at))
		: null;

	return (
		<div>
			<div className="stack horizontal sm">
				<div className={styles.datePickerFullWidth}>
					<SendouDatePicker
						label={t("scrims:forms.notFoundVisibility.title")}
						granularity="minute"
						errorText={error ? t(`forms:${error}` as never) : undefined}
						errorId={errorMessageId("notFoundVisibility")}
						value={dateValue}
						onChange={handleDateChange}
						bottomText={
							notFoundVisibility.at
								? undefined
								: t("scrims:forms.notFoundVisibility.explanation")
						}
					/>
				</div>
				{notFoundVisibility.at ? (
					<div className="w-full">
						<Label htmlFor="not-found-visibility">
							{t("scrims:forms.visibility.title")}
						</Label>
						<AssociationSelect
							associations={associations}
							id="not-found-visibility"
							value={String(notFoundVisibility.forAssociation)}
							onChange={handleAssociationChange}
						/>
					</div>
				) : null}
			</div>
		</div>
	);
}

function AssociationSelect({
	associations,
	id,
	value,
	onChange,
}: {
	associations: ScrimsNewLoaderData["associations"];
	id: string;
	value: string;
	onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
	const { t } = useTranslation(["scrims"]);

	return (
		<select id={id} className="w-full" value={value} onChange={onChange}>
			<option value="PUBLIC">{t("scrims:forms.visibility.public")}</option>
			{associations.virtual.map((association) => (
				<option key={association} value={association}>
					{association === "FRIENDS"
						? t("scrims:forms.visibility.friends")
						: association}
				</option>
			))}
			{associations.actual.map((association) => (
				<option key={association.id} value={association.id}>
					{association.name}
				</option>
			))}
		</select>
	);
}

function MapsTournamentFormField() {
	const { values } = useFormFieldContext();

	if (values.maps !== "TOURNAMENT") return null;

	return <FormField name="mapsTournamentId" />;
}
