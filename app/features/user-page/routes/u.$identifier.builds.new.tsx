import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData, useMatches } from "react-router";
import { AbilitiesSelector } from "~/components/AbilitiesSelector";
import { Alert } from "~/components/Alert";
import { GearSelect } from "~/components/GearSelect";
import { Main } from "~/components/Main";
import type { GearType } from "~/db/tables";
import { BUILD } from "~/features/builds/builds-constants";
import { FormField } from "~/form/FormField";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import type { BuildAbilitiesTupleWithUnknown } from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { action } from "../actions/u.$identifier.builds.new.server";
import { loader } from "../loaders/u.$identifier.builds.new.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import { newBuildSchema } from "../user-page-schemas";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds", "gear"],
};

export default function NewBuildPage() {
	const { defaultValues, gearIdToAbilities } = useLoaderData<typeof loader>();
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;
	const { t } = useTranslation(["builds", "common"]);

	if (layoutData.user.buildsCount >= BUILD.MAX_COUNT) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">{t("builds:reachBuildMaxCount")}</Alert>
			</Main>
		);
	}

	const isEditing = defaultValues?.buildToEditId != null;

	return (
		<div className="half-width u__build-form">
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
							{(props) => (
								<GearFormField
									type="HEAD"
									gearIdToAbilities={gearIdToAbilities}
									{...props}
								/>
							)}
						</FormField>
						<FormField name={names.clothes}>
							{(props) => (
								<GearFormField
									type="CLOTHES"
									gearIdToAbilities={gearIdToAbilities}
									{...props}
								/>
							)}
						</FormField>
						<FormField name={names.shoes}>
							{(props) => (
								<GearFormField
									type="SHOES"
									gearIdToAbilities={gearIdToAbilities}
									{...props}
								/>
							)}
						</FormField>
						<FormField name={names.abilities}>
							{(props) => <AbilitiesFormField {...props} />}
						</FormField>
						<FormField name={names.title} />
						<FormField name={names.description} />
						<FormField name={names.modes} />
						<FormField name={names.private} />
					</>
				)}
			</SendouForm>
		</div>
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
