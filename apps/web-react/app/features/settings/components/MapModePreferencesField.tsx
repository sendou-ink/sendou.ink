import * as React from "react";
import { ModeImage } from "~/components/Image";
import type { Preference, UserMapModePreferences } from "~/db/tables-json";
import { BANNED_MAPS } from "~/features/match-profile/banned-maps";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "~/features/match-profile/match-profile-constants";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { ModeMapPoolPicker } from "./ModeMapPoolPicker";
import { PreferenceRadioGroup } from "./PreferenceRadioGroup";

export function preferencesFromRaw(
	raw: UserMapModePreferences | null | undefined,
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

export function MapModePreferencesField({
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
