import * as React from "react";
import { useLoaderData } from "react-router";
import { ModeImage } from "~/components/Image";
import type { Preference, UserMapModePreferences } from "~/db/tables";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "~/features/match-profile/match-profile-constants";
import { SendouForm } from "~/form/SendouForm";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { loader } from "../loaders/settings.server";
import { updateMatchProfileSchema } from "../match-profile-schemas";
import { ModeMapPoolPicker } from "./ModeMapPoolPicker";
import { PreferenceRadioGroup } from "./PreferenceRadioGroup";

export function MatchProfileTab() {
	const data = useLoaderData<typeof loader>();
	const matchProfile = data.matchProfile;

	if (!matchProfile) return null;

	return (
		<SendouForm
			schema={updateMatchProfileSchema}
			defaultValues={{
				mapModePreferences: preferencesFromRaw(matchProfile.mapModePreferences),
				weaponPool: (matchProfile.weaponPool ?? []).map((w) => ({
					id: w.weaponSplId,
					isFavorite: Boolean(w.isFavorite),
				})),
				vc: matchProfile.vc ?? "NO",
				languages: matchProfile.languages ?? [],
				noScreen: Boolean(matchProfile.noScreen),
			}}
			revalidateRoot
		>
			{({ FormField }) => (
				<>
					<FormField name="mapModePreferences">
						{(props: {
							value: unknown;
							onChange: (value: UserMapModePreferences) => void;
						}) => (
							<MapModePreferencesField
								value={props.value as UserMapModePreferences}
								onChange={props.onChange}
							/>
						)}
					</FormField>
					<FormField name="weaponPool" />
					<FormField name="vc" />
					<FormField name="languages" />
					<FormField name="noScreen" />
				</>
			)}
		</SendouForm>
	);
}

function preferencesFromRaw(
	raw: UserMapModePreferences | null,
): UserMapModePreferences {
	if (!raw) return { pool: [], modes: [] };

	return {
		modes: raw.modes,
		pool: raw.pool.map((p) => ({
			mode: p.mode,
			stages: p.stages.filter((s) => !BANNED_MAPS[p.mode].includes(s)),
		})),
	};
}

function MapModePreferencesField({
	value,
	onChange,
}: {
	value: UserMapModePreferences;
	onChange: (value: UserMapModePreferences) => void;
}) {
	const handleModePreferenceChange = ({
		mode,
		preference,
	}: {
		mode: ModeShort;
		preference: Preference & "NEUTRAL";
	}) => {
		const newModePreferences = value.modes.filter((map) => map.mode !== mode);
		if (preference !== "NEUTRAL") {
			newModePreferences.push({ mode, preference });
		}
		onChange({ modes: newModePreferences, pool: value.pool });
	};

	const handlePoolChange = (mode: ModeShort, stages: StageId[]) => {
		const filtered = value.pool.filter((p) => p.mode !== mode);
		filtered.push({ mode, stages });
		onChange({ ...value, pool: filtered });
	};

	const pickableModes = modesShort.filter((mode) => {
		const mp = value.modes.find((p) => p.mode === mode);
		return mp?.preference !== "AVOID";
	});

	const [selectedMode, setSelectedMode] = React.useState<ModeShort>(
		modesShort[0],
	);
	const activeMode = pickableModes.includes(selectedMode)
		? selectedMode
		: pickableModes[0];

	return (
		<div className="stack lg">
			<div className="stack items-center">
				{modesShort.map((modeShort) => {
					const preference = value.modes.find(
						(preference) => preference.mode === modeShort,
					);

					return (
						<div key={modeShort} className="stack horizontal xs my-1">
							<ModeImage mode={modeShort} width={32} />
							<PreferenceRadioGroup
								preference={preference?.preference}
								onPreferenceChange={(preference) =>
									handleModePreferenceChange({ mode: modeShort, preference })
								}
								aria-label={`Select preference towards ${modeShort}`}
							/>
						</div>
					);
				})}
			</div>

			{activeMode ? (
				<ModeMapPoolPicker
					mode={activeMode}
					modeTabs={pickableModes}
					onModeChange={setSelectedMode}
					amountToPick={AMOUNT_OF_MAPS_IN_POOL_PER_MODE}
					pool={value.pool.find((p) => p.mode === activeMode)?.stages ?? []}
					onChange={(stages) => handlePoolChange(activeMode, stages)}
				/>
			) : null}
		</div>
	);
}
