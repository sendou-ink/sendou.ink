import { useLoaderData } from "react-router";
import { ModeImage } from "~/components/Image";
import type { Preference, UserMapModePreferences } from "~/db/tables";
import { BANNED_MAPS } from "~/features/sendouq-settings/banned-maps";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "~/features/sendouq-settings/q-settings-constants";
import { SendouForm } from "~/form/SendouForm";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import type { loader } from "../loaders/settings.server";
import { updateMatchProfileSchema } from "../match-profile-schemas";
import { ModeMapPoolPicker } from "./ModeMapPoolPicker";
import { PreferenceRadioGroup } from "./PreferenceRadioGroup";

export function MatchProfileTab() {
	const data = useLoaderData<typeof loader>();
	const qSettings = data.qSettings;

	// xxx: check if this is correct
	if (!qSettings) return null;

	return (
		<SendouForm
			schema={updateMatchProfileSchema}
			defaultValues={{
				mapModePreferences: preferencesFromRaw(qSettings.mapModePreferences),
				weaponPool: (qSettings.qWeaponPool ?? []).map((w) => ({
					id: w.weaponSplId,
					isFavorite: Boolean(w.isFavorite),
				})),
				vc: qSettings.vc ?? "NO",
				languages: qSettings.languages ?? [],
				noScreen: Boolean(data.noScreen),
				noSplatnet: Boolean(data.noSplatnet),
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
					<FormField name="noSplatnet" />
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
		const newPool =
			preference === "AVOID"
				? value.pool.filter((p) => p.mode !== mode)
				: value.pool;
		onChange({ modes: newModePreferences, pool: newPool });
	};

	const handlePoolChange = (mode: ModeShort, stages: StageId[]) => {
		const filtered = value.pool.filter((p) => p.mode !== mode);
		filtered.push({ mode, stages });
		onChange({ ...value, pool: filtered });
	};

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

			<div className="stack lg">
				{modesShort.map((mode) => {
					const mp = value.modes.find((p) => p.mode === mode);
					if (mp?.preference === "AVOID") return null;

					return (
						<ModeMapPoolPicker
							key={mode}
							mode={mode}
							amountToPick={AMOUNT_OF_MAPS_IN_POOL_PER_MODE}
							pool={value.pool.find((p) => p.mode === mode)?.stages ?? []}
							onChange={(stages) => handlePoolChange(mode, stages)}
						/>
					);
				})}
			</div>
		</div>
	);
}
