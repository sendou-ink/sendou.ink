import { useLoaderData } from "@remix-run/react";
import * as React from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { Label } from "~/components/Label";
import { DateFormField } from "~/components/form/DateFormField";
import { SendouForm } from "~/components/form/SendouForm";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import { nullFilledArray } from "~/utils/arrays";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { FormMessage } from "../../../components/FormMessage";
import { Main } from "../../../components/Main";
import { WithFormField } from "../components/WithFormField";
import { LUTI_DIVS, SCRIM } from "../scrims-constants";
import {
	MAX_SCRIM_POST_TEXT_LENGTH,
	scrimsNewActionSchema,
} from "../scrims-schemas";
import type { LutiDiv } from "../scrims-types";

import { action } from "../actions/scrims.new.server";
import { type ScrimsNewLoaderData, loader } from "../loaders/scrims.new.server";
export { loader, action };

export const handle: SendouRouteHandle = {
	i18n: "scrims",
};

type FormFields = z.infer<typeof scrimsNewActionSchema>;

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
				schema={scrimsNewActionSchema}
				heading={t("scrims:forms.title")}
				defaultValues={{
					postText: "",
					at: new Date(),
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
				}}
			>
				<WithFormField usersTeams={data.teams} />

				<DateFormField<FormFields>
					label={t("scrims:forms.when.title")}
					name="at"
					bottomText={t("scrims:forms.when.explanation")}
					granularity="minute"
				/>

				<BaseVisibilityFormField associations={data.associations} />

				<NotFoundVisibilityFormField associations={data.associations} />

				<LutiDivsFormField />

				<TextAreaFormField<FormFields>
					label={t("scrims:forms.text.title")}
					name="postText"
					maxLength={MAX_SCRIM_POST_TEXT_LENGTH}
				/>
			</SendouForm>
		</Main>
	);
}

function BaseVisibilityFormField({
	associations,
}: { associations: ScrimsNewLoaderData["associations"] }) {
	const { t } = useTranslation(["scrims"]);
	const methods = useFormContext<FormFields>();

	const error = methods.formState.errors.baseVisibility;

	const noAssociations =
		associations.virtual.length === 0 && associations.actual.length === 0;

	return (
		<div>
			<Label htmlFor="visibility">{t("scrims:forms.visibility.title")}</Label>
			{noAssociations ? (
				<FormMessage type="info">
					{t("scrims:forms.visibility.noneAvailable")}
				</FormMessage>
			) : (
				<AssociationSelect
					associations={associations}
					id="visibility"
					{...methods.register("baseVisibility")}
				/>
			)}

			{error && (
				<FormMessage type="error">{error.message as string}</FormMessage>
			)}
		</div>
	);
}

function NotFoundVisibilityFormField({
	associations,
}: { associations: ScrimsNewLoaderData["associations"] }) {
	const { t } = useTranslation(["scrims"]);
	const baseVisibility = useWatch<FormFields>({
		name: "baseVisibility",
	});
	const date = useWatch<FormFields>({ name: "notFoundVisibility.at" }) ?? "";
	const methods = useFormContext<FormFields>();

	React.useEffect(() => {
		if (baseVisibility === "PUBLIC") {
			methods.setValue("notFoundVisibility", DEFAULT_NOT_FOUND_VISIBILITY);
		}
	}, [baseVisibility, methods.setValue]);

	const error = methods.formState.errors.notFoundVisibility;

	const noAssociations =
		associations.virtual.length === 0 && associations.actual.length === 0;

	if (noAssociations || baseVisibility === "PUBLIC") return null;

	return (
		<div>
			<div className="stack horizontal sm">
				<DateFormField<FormFields>
					label={t("scrims:forms.notFoundVisibility.title")}
					name="notFoundVisibility.at"
					granularity="minute"
				/>
				{date ? (
					<div>
						<Label htmlFor="not-found-visibility">
							{t("scrims:forms.visibility.title")}
						</Label>
						<AssociationSelect
							associations={associations}
							id="not-found-visibility"
							{...methods.register("notFoundVisibility.forAssociation")}
						/>
					</div>
				) : null}
			</div>
			{error ? (
				<FormMessage type="error">{error.message as string}</FormMessage>
			) : (
				<FormMessage type="info">
					{t("scrims:forms.notFoundVisibility.explanation")}
				</FormMessage>
			)}
		</div>
	);
}

const AssociationSelect = React.forwardRef<
	HTMLSelectElement,
	{
		associations: ScrimsNewLoaderData["associations"];
	} & React.SelectHTMLAttributes<HTMLSelectElement>
>(({ associations, ...rest }, ref) => {
	const { t } = useTranslation(["scrims"]);

	return (
		<select ref={ref} {...rest}>
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
});

function LutiDivsFormField() {
	const methods = useFormContext<FormFields>();

	const error = methods.formState.errors.divs;

	return (
		<div>
			<Controller
				control={methods.control}
				name="divs"
				render={({ field: { onChange, onBlur, value } }) => (
					<LutiDivsSelector value={value} onChange={onChange} onBlur={onBlur} />
				)}
			/>

			{error && (
				<FormMessage type="error">{error.message as string}</FormMessage>
			)}
		</div>
	);
}

type LutiDivEdit = {
	max: LutiDiv | null;
	min: LutiDiv | null;
};

function LutiDivsSelector({
	value,
	onChange,
	onBlur,
}: {
	value: LutiDivEdit | null;
	onChange: (value: LutiDivEdit | null) => void;
	onBlur: () => void;
}) {
	const { t } = useTranslation(["scrims"]);

	const onChangeMin = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newValue = e.target.value === "" ? null : (e.target.value as LutiDiv);

		onChange(
			newValue || value?.max
				? { min: newValue, max: value?.max ?? null }
				: null,
		);
	};

	const onChangeMax = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const newValue = e.target.value === "" ? null : (e.target.value as LutiDiv);

		onChange(
			newValue || value?.min
				? { max: newValue, min: value?.min ?? null }
				: null,
		);
	};

	return (
		<div className="stack horizontal sm">
			<div>
				<Label htmlFor="min-div">{t("scrims:forms.divs.minDiv.title")}</Label>
				<select id="min-div" onChange={onChangeMin} onBlur={onBlur}>
					<option value="">—</option>
					{LUTI_DIVS.map((div) => (
						<option key={div} value={div}>
							{div}
						</option>
					))}
				</select>
			</div>

			<div>
				<Label htmlFor="max-div">{t("scrims:forms.divs.maxDiv.title")}</Label>
				<select id="max-div" onChange={onChangeMax} onBlur={onBlur}>
					<option value="">—</option>
					{LUTI_DIVS.map((div) => (
						<option key={div} value={div}>
							{div}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}
