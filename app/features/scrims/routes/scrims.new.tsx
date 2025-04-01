import { useLoaderData } from "@remix-run/react";
import * as React from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import type { z } from "zod";
import { Label } from "~/components/Label";
import { DateTimeFormField } from "~/components/form/DateTimeFormField";
import { MyForm } from "~/components/form/MyForm";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import { FormMessage } from "../../../components/FormMessage";
import { Main } from "../../../components/Main";
import { FromFormField } from "../components/FromFormField";
import { LUTI_DIVS } from "../scrims-constants";
import {
	MAX_SCRIM_POST_TEXT_LENGTH,
	scrimsNewActionSchema,
} from "../scrims-schemas";
import type { LutiDiv } from "../scrims-types";

import { action } from "../actions/scrims.new.server";
import { type ScrimsNewLoaderData, loader } from "../loaders/scrims.new.server";
export { loader, action };

type FormFields = z.infer<typeof scrimsNewActionSchema>;

// xxx: editing scrimPost

export default function NewScrimPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main>
			<MyForm
				schema={scrimsNewActionSchema}
				title="Creating a new scrim post"
				defaultValues={{
					postText: "",
					at: new Date(),
					divs: null,
					baseVisibility: "PUBLIC",
					notFoundVisibility: {
						at: null,
						forAssociation: "PUBLIC",
					},
					from:
						data.teams.length > 0
							? { mode: "TEAM", teamId: data.teams[0].id }
							: {
									mode: "PICKUP",
									users: [],
								},
				}}
			>
				<FromFormField usersTeams={data.teams} />

				<DateTimeFormField<FormFields>
					label="When"
					name="at"
					bottomText="Leave blank if you want to look for a scrim now"
				/>

				<BaseVisibilityFormField associations={data.associations} />

				<NotFoundVisibilityFormField associations={data.associations} />

				<LutiDivsFormField />

				<TextAreaFormField<FormFields>
					label="Text"
					name="postText"
					maxLength={MAX_SCRIM_POST_TEXT_LENGTH}
				/>
			</MyForm>
		</Main>
	);
}

function BaseVisibilityFormField({
	associations,
}: { associations: ScrimsNewLoaderData["associations"] }) {
	const methods = useFormContext<FormFields>();

	const error = methods.formState.errors.baseVisibility;

	const noAssociations =
		associations.virtual.length === 0 && associations.actual.length === 0;

	return (
		<div>
			<Label htmlFor="visibility">Visibility</Label>
			{noAssociations ? (
				<FormMessage type="info">
					No associations available. Create one to look for a scrim in a smaller
					group.
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
	const date = useWatch<FormFields>({ name: "notFoundVisibility.at" }) ?? "";
	const methods = useFormContext<FormFields>();

	const error = methods.formState.errors.notFoundVisibility;

	const noAssociations =
		associations.virtual.length === 0 && associations.actual.length === 0;

	if (noAssociations) return null;

	return (
		<div>
			<div className="stack horizontal sm">
				<DateTimeFormField<FormFields>
					label="If not found by"
					name="notFoundVisibility.at"
				/>
				{date ? (
					<div>
						<Label htmlFor="not-found-visibility">Visibility</Label>
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
					Leave blank if you don't want the visibility of your post to change
					over time
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
	return (
		<select ref={ref} {...rest}>
			<option value="PUBLIC">Public</option>
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
				<Label htmlFor="min-div">Min div</Label>
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
				<Label htmlFor="max-div">Max div</Label>
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
