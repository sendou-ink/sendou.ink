import type { CalendarDateTime } from "@internationalized/date";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import type { z } from "zod";
import { SendouDatePicker } from "~/components/elements/DatePicker";
import { TournamentSearch } from "~/components/elements/TournamentSearch";
import { Label } from "~/components/Label";
import { FormField } from "~/form/FormField";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { errorMessageId } from "~/form/utils";
import { nullFilledArray } from "~/utils/arrays";
import { dateToDateValue } from "~/utils/dates";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { FormMessage } from "../../../components/FormMessage";
import { Main } from "../../../components/Main";
import { action } from "../actions/scrims.new.server";
import { WithFormField } from "../components/WithFormField";
import { loader, type ScrimsNewLoaderData } from "../loaders/scrims.new.server";
import { LUTI_DIVS, SCRIM } from "../scrims-constants";
import { scrimsNewFormSchema } from "../scrims-schemas";
import type { LutiDiv } from "../scrims-types";
import styles from "./scrims.new.module.css";
export { loader, action };

export const handle: SendouRouteHandle = {
	i18n: "scrims",
};

type FormFields = z.infer<typeof scrimsNewFormSchema>;

const DEFAULT_NOT_FOUND_VISIBILITY = {
	at: null,
	forAssociation: "PUBLIC",
} as const;

export default function NewScrimPage() {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();

	return (
		<Main>
			<SendouForm
				schema={scrimsNewFormSchema}
				title={t("scrims:forms.title")}
				defaultValues={{
					postText: "",
					at: new Date(),
					rangeEnd: null,
					divs: null,
					baseVisibility: "PUBLIC",
					notFoundVisibility: DEFAULT_NOT_FOUND_VISIBILITY,
					from:
						data.teams.length > 0
							? { mode: "TEAM", teamId: data.teams[0].id }
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
				{({ names }) => (
					<>
						<FormField name={names.from}>
							{(props) => <WithFormField usersTeams={data.teams} {...props} />}
						</FormField>

						<FormField name={names.at} />
						<FormField name={names.rangeEnd} />

						<FormField name={names.baseVisibility}>
							{(props) => (
								<BaseVisibilityFormField
									associations={data.associations}
									{...props}
								/>
							)}
						</FormField>

						<NotFoundVisibilityFormField associations={data.associations} />

						<FormField name={names.divs}>
							{(props) => <LutiDivsFormField {...props} />}
						</FormField>

						<FormField name={names.maps} />

						<TournamentSearchFormField />

						<FormField name={names.postText} />

						<FormField name={names.managedByAnyone} />
					</>
				)}
			</SendouForm>
		</Main>
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
					{association}
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

function LutiDivsFormField({
	name,
	value,
	onChange,
	error,
}: {
	name: string;
	value: unknown;
	onChange: (value: unknown) => void;
	error: string | undefined;
}) {
	const { t } = useTranslation(["scrims"]);

	const divsValue = value as {
		min: LutiDiv | null;
		max: LutiDiv | null;
	} | null;

	const handleMaxChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newMax = e.target.value === "" ? null : (e.target.value as LutiDiv);
		const currentMin = divsValue?.min ?? null;

		if (!newMax && !currentMin) {
			onChange(null);
		} else {
			onChange({ max: newMax, min: currentMin });
		}
	};

	const handleMinChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newMin = e.target.value === "" ? null : (e.target.value as LutiDiv);
		const currentMax = divsValue?.max ?? null;

		if (!newMin && !currentMax) {
			onChange(null);
		} else {
			onChange({ max: currentMax, min: newMin });
		}
	};

	return (
		<FormFieldWrapper id={`${name}-divs`} name={name} error={error}>
			<div className="stack horizontal sm">
				<div className="w-full">
					<Label htmlFor="max-div">{t("scrims:forms.divs.maxDiv.title")}</Label>
					<select
						id="max-div"
						className="w-full"
						value={divsValue?.max ?? ""}
						onChange={handleMaxChange}
					>
						<option value="">—</option>
						{LUTI_DIVS.map((div) => (
							<option key={div} value={div}>
								{div}
							</option>
						))}
					</select>
				</div>

				<div className="w-full">
					<Label htmlFor="min-div">{t("scrims:forms.divs.minDiv.title")}</Label>
					<select
						id="min-div"
						className="w-full"
						value={divsValue?.min ?? ""}
						onChange={handleMinChange}
					>
						<option value="">—</option>
						{LUTI_DIVS.map((div) => (
							<option key={div} value={div}>
								{div}
							</option>
						))}
					</select>
				</div>
			</div>
		</FormFieldWrapper>
	);
}

function TournamentSearchFormField() {
	const { t } = useTranslation(["scrims"]);
	const { values, setValue, clientErrors, serverErrors } =
		useFormFieldContext();
	const maps = values.maps as string;
	const mapsTournamentId = values.mapsTournamentId as number | null;

	const error = serverErrors.mapsTournamentId ?? clientErrors.mapsTournamentId;

	const prevMaps = React.useRef(maps);
	if (prevMaps.current !== maps) {
		prevMaps.current = maps;
		if (maps !== "TOURNAMENT") {
			setValue("mapsTournamentId", null);
		}
	}

	if (maps !== "TOURNAMENT") return null;

	return (
		<FormFieldWrapper id="mapsTournamentId" name="mapsTournamentId">
			<TournamentSearch
				label={t("scrims:forms.mapsTournament.title")}
				initialTournamentId={mapsTournamentId ?? undefined}
				onChange={(tournament) =>
					setValue("mapsTournamentId", tournament?.id ?? null)
				}
			/>
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
		</FormFieldWrapper>
	);
}
