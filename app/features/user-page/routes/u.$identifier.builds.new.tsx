import * as React from "react";
import { useTranslation } from "react-i18next";
import { Form, useLoaderData, useMatches, useSearchParams } from "react-router";
import { AbilitiesSelector } from "~/components/AbilitiesSelector";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { GearSelect } from "~/components/GearSelect";
import { Image } from "~/components/Image";
import { CrossIcon } from "~/components/icons/Cross";
import { PlusIcon } from "~/components/icons/Plus";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { RequiredHiddenInput } from "~/components/RequiredHiddenInput";
import { SubmitButton } from "~/components/SubmitButton";
import { WeaponSelect } from "~/components/WeaponSelect";
import type { GearType } from "~/db/tables";
import {
	validatedBuildFromSearchParams,
	validatedWeaponIdFromSearchParams,
} from "~/features/build-analyzer/core/utils";
import { BUILD } from "~/features/builds/builds-constants";
import { modesShort, rankedModesShort } from "~/modules/in-game-lists/modes";
import type {
	BuildAbilitiesTupleWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { modeImageUrl } from "~/utils/urls";
import { action } from "../actions/u.$identifier.builds.new.server";
import { loader } from "../loaders/u.$identifier.builds.new.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
export { loader, action };

import { mainStyles } from "~/components/Main";

export const handle: SendouRouteHandle = {
	i18n: ["weapons", "builds", "gear"],
};

export default function NewBuildPage() {
	const { buildToEdit } = useLoaderData<typeof loader>();
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;
	const { t } = useTranslation(["builds", "common"]);
	const [searchParams] = useSearchParams();
	const [abilities, setAbilities] =
		React.useState<BuildAbilitiesTupleWithUnknown>(
			buildToEdit?.abilities ?? validatedBuildFromSearchParams(searchParams),
		);

	if (layoutData.user.buildsCount >= BUILD.MAX_COUNT) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">{t("builds:reachBuildMaxCount")}</Alert>
			</Main>
		);
	}

	return (
		<div className={mainStyles.narrow}>
			<Form className="stack md items-start" method="post">
				{buildToEdit && (
					<input type="hidden" name="buildToEditId" value={buildToEdit.id} />
				)}
				<WeaponsSelector />
				<FormMessage type="info">{t("builds:forms.noGear.info")}</FormMessage>
				<GearSelector
					type="HEAD"
					abilities={abilities}
					setAbilities={setAbilities}
				/>
				<GearSelector
					type="CLOTHES"
					abilities={abilities}
					setAbilities={setAbilities}
				/>
				<GearSelector
					type="SHOES"
					abilities={abilities}
					setAbilities={setAbilities}
				/>
				<div /> {/* spacer */}
				<Abilities abilities={abilities} setAbilities={setAbilities} />
				<TitleInput />
				<DescriptionTextarea />
				<ModeCheckboxes />
				<PrivateCheckbox />
				<SubmitButton className="mt-4">
					{t("common:actions.submit")}
				</SubmitButton>
			</Form>
		</div>
	);
}

function TitleInput() {
	const { t } = useTranslation("builds");
	const { buildToEdit } = useLoaderData<typeof loader>();

	return (
		<div>
			<Label htmlFor="title" required>
				{t("forms.title")}
			</Label>
			<input
				id="title"
				name="title"
				required
				minLength={BUILD.TITLE_MIN_LENGTH}
				maxLength={BUILD.TITLE_MAX_LENGTH}
				defaultValue={buildToEdit?.title}
			/>
		</div>
	);
}

function DescriptionTextarea() {
	const { t } = useTranslation();
	const { buildToEdit } = useLoaderData<typeof loader>();
	const [value, setValue] = React.useState(buildToEdit?.description ?? "");

	return (
		<div>
			<Label
				htmlFor="description"
				valueLimits={{
					current: value.length,
					max: BUILD.DESCRIPTION_MAX_LENGTH,
				}}
			>
				{t("forms.description")}
			</Label>
			<textarea
				id="description"
				name="description"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				maxLength={BUILD.DESCRIPTION_MAX_LENGTH}
			/>
		</div>
	);
}

function ModeCheckboxes() {
	const { buildToEdit } = useLoaderData<typeof loader>();
	const { t } = useTranslation("builds");

	const modes = buildToEdit?.modes ?? rankedModesShort;

	return (
		<div>
			<Label>{t("forms.modes")}</Label>
			<div className="stack horizontal md">
				{modesShort.map((mode) => (
					<div key={mode} className="stack items-center">
						<label htmlFor={mode}>
							<Image alt="" path={modeImageUrl(mode)} width={24} height={24} />
						</label>
						<input
							id={mode}
							name={mode}
							type="checkbox"
							defaultChecked={modes.includes(mode)}
							data-testid={`${mode}-checkbox`}
						/>
					</div>
				))}
			</div>
		</div>
	);
}

function PrivateCheckbox() {
	const { buildToEdit } = useLoaderData<typeof loader>();
	const { t } = useTranslation(["builds", "common"]);

	return (
		<div>
			<Label htmlFor="private">{t("common:build.private")}</Label>
			<input
				id="private"
				name="private"
				type="checkbox"
				defaultChecked={Boolean(buildToEdit?.private)}
			/>
			<FormMessage type="info" className="mt-0">
				{t("builds:forms.private.info")}
			</FormMessage>
		</div>
	);
}

function WeaponsSelector() {
	const [searchParams] = useSearchParams();
	const { buildToEdit } = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "weapons", "builds"]);
	const [weapons, setWeapons] = React.useState<Array<MainWeaponId | null>>(
		buildToEdit?.weapons.map((wpn) => wpn.weaponSplId) ?? [
			validatedWeaponIdFromSearchParams(searchParams),
		],
	);

	return (
		<div>
			<Label required htmlFor="weapon">
				{t("builds:forms.weapons")}
			</Label>
			<input type="hidden" name="weapons" value={JSON.stringify(weapons)} />
			<div className="stack sm">
				{weapons.map((weapon, i) => {
					return (
						<div key={i} className="stack horizontal sm items-center">
							<WeaponSelect
								isRequired
								onChange={(weaponId) =>
									setWeapons((weapons) => {
										const newWeapons = [...weapons];
										newWeapons[i] = weaponId;
										return newWeapons;
									})
								}
								value={weapon ?? null}
								testId={`weapon-${i}`}
							/>
							{i === weapons.length - 1 && (
								<>
									<SendouButton
										size="small"
										isDisabled={weapons.length === BUILD.MAX_WEAPONS_COUNT}
										onPress={() => setWeapons((weapons) => [...weapons, null])}
										icon={<PlusIcon />}
										data-testid="add-weapon-button"
									/>
									{weapons.length > 1 && (
										<SendouButton
											size="small"
											onPress={() =>
												setWeapons((weapons) => {
													const newWeapons = [...weapons];
													newWeapons.pop();
													return newWeapons;
												})
											}
											variant="destructive"
											icon={<CrossIcon />}
										/>
									)}
								</>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function GearSelector({
	type,
	abilities,
	setAbilities,
}: {
	type: GearType;
	abilities: BuildAbilitiesTupleWithUnknown;
	setAbilities: (abilities: BuildAbilitiesTupleWithUnknown) => void;
}) {
	const { buildToEdit, gearIdToAbilities } = useLoaderData<typeof loader>();
	const { t } = useTranslation("builds");
	const [value, setValue] = React.useState(() => {
		const gearId = !buildToEdit
			? null
			: type === "HEAD"
				? buildToEdit.headGearSplId
				: type === "CLOTHES"
					? buildToEdit.clothesGearSplId
					: buildToEdit.shoesGearSplId;

		if (gearId === -1) return null;

		return gearId;
	});

	return (
		<>
			<input type="hidden" name={type} value={value ?? ""} />
			<GearSelect
				label={t(`forms.gear.${type}`)}
				type={type}
				value={value}
				clearable
				onChange={(gearId) => {
					setValue(gearId);

					if (!gearId) return;

					const abilitiesFromExistingGear =
						gearIdToAbilities[`${type}_${gearId}`];

					if (!abilitiesFromExistingGear) return;

					const gearIndex = type === "HEAD" ? 0 : type === "CLOTHES" ? 1 : 2;

					const currentAbilities = abilities[gearIndex];

					// let's not overwrite current selections
					if (!currentAbilities.every((a) => a === "UNKNOWN")) return;

					const newAbilities = structuredClone(abilities);
					newAbilities[gearIndex] = abilitiesFromExistingGear;

					setAbilities(newAbilities);
				}}
			/>
		</>
	);
}

function Abilities({
	abilities,
	setAbilities,
}: {
	abilities: BuildAbilitiesTupleWithUnknown;
	setAbilities: (abilities: BuildAbilitiesTupleWithUnknown) => void;
}) {
	return (
		<div>
			<RequiredHiddenInput
				value={JSON.stringify(abilities)}
				isValid={abilities.flat().every((a) => a !== "UNKNOWN")}
				name="abilities"
			/>
			<AbilitiesSelector
				selectedAbilities={abilities}
				onChange={setAbilities}
			/>
		</div>
	);
}
