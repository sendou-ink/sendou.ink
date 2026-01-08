import * as React from "react";
import { useTranslation } from "react-i18next";
import { AbilitiesSelector } from "~/components/AbilitiesSelector";
import { GearSelect } from "~/components/GearSelect";
import type { GearType } from "~/db/tables";
import { type CustomFieldRenderProps, FormField } from "~/form/FormField";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { BuildAbilitiesTupleWithUnknown } from "~/modules/in-game-lists/types";
import { newBuildSchema } from "../user-page-schemas";

interface NewBuildFormProps {
	defaultValues?: Parameters<typeof SendouForm>[0]["defaultValues"];
	gearIdToAbilities: Record<string, BuildAbilitiesTupleWithUnknown[number]>;
	isEditing?: boolean;
}

export function NewBuildForm({
	defaultValues,
	gearIdToAbilities,
	isEditing,
}: NewBuildFormProps) {
	const { t } = useTranslation(["builds"]);

	return (
		<SendouForm
			schema={newBuildSchema}
			defaultValues={
				defaultValues ?? {
					modes: [...rankedModesShort],
				}
			}
			title={t(
				isEditing ? "builds:forms.title.edit" : "builds:forms.title.new",
			)}
		>
			{({ names }) => (
				<>
					<FormField name={names.weapons} />
					<FormField name={names.head}>
						{(props: CustomFieldRenderProps) => (
							<GearFormField
								type="HEAD"
								gearIdToAbilities={gearIdToAbilities}
								{...props}
							/>
						)}
					</FormField>
					<FormField name={names.clothes}>
						{(props: CustomFieldRenderProps) => (
							<GearFormField
								type="CLOTHES"
								gearIdToAbilities={gearIdToAbilities}
								{...props}
							/>
						)}
					</FormField>
					<FormField name={names.shoes}>
						{(props: CustomFieldRenderProps) => (
							<GearFormField
								type="SHOES"
								gearIdToAbilities={gearIdToAbilities}
								{...props}
							/>
						)}
					</FormField>
					<FormField name={names.abilities}>
						{(props: CustomFieldRenderProps) => (
							<AbilitiesFormField {...props} />
						)}
					</FormField>
					<FormField name={names.title} />
					<FormField name={names.description} />
					<FormField name={names.modes} />
					<FormField name={names.private} />
				</>
			)}
		</SendouForm>
	);
}

function GearFormField({
	type,
	name,
	value,
	onChange,
	error,
	gearIdToAbilities,
}: {
	type: GearType;
	name: string;
	value: unknown;
	onChange: (value: unknown) => void;
	error: string | undefined;
	gearIdToAbilities: Record<string, BuildAbilitiesTupleWithUnknown[number]>;
}) {
	const { t } = useTranslation("builds");
	const { values, setValue } = useFormFieldContext();
	const id = React.useId();

	const handleChange = (gearId: number | null) => {
		onChange(gearId);

		if (!gearId) return;

		const abilitiesFromExistingGear = gearIdToAbilities[`${type}_${gearId}`];
		if (!abilitiesFromExistingGear) return;

		const abilities = values.abilities as BuildAbilitiesTupleWithUnknown;
		const gearIndex = type === "HEAD" ? 0 : type === "CLOTHES" ? 1 : 2;
		const currentAbilities = abilities[gearIndex];

		if (!currentAbilities.every((a) => a === "UNKNOWN")) return;

		const newAbilities = structuredClone(abilities);
		newAbilities[gearIndex] = abilitiesFromExistingGear;
		setValue("abilities", newAbilities);
	};

	return (
		<FormFieldWrapper
			id={id}
			name={name}
			label={t(`forms.gear.${type}`)}
			error={error}
		>
			<GearSelect
				type={type}
				value={value as number | null}
				clearable
				onChange={handleChange}
			/>
		</FormFieldWrapper>
	);
}

function AbilitiesFormField({
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
	const { t } = useTranslation("builds");

	return (
		<FormFieldWrapper
			id={`${name}-abilities`}
			name={name}
			label={t("forms.abilities")}
			error={error}
		>
			<AbilitiesSelector
				selectedAbilities={value as BuildAbilitiesTupleWithUnknown}
				onChange={onChange}
			/>
		</FormFieldWrapper>
	);
}
