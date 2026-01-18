import {
	Map as MapIcon,
	Mic,
	Puzzle,
	Star,
	Trash,
	Users,
	Volume2,
	X,
} from "lucide-react";
import * as React from "react";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { FormMessage } from "~/components/FormMessage";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { ModeImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import type { Preference, UserMapModePreferences } from "~/db/tables";
import {
	soundCodeToLocalStorageKey,
	soundVolume,
} from "~/features/chat/chat-utils";
import { updateNoScreenSchema } from "~/features/settings/settings-schemas";
import { SendouForm } from "~/form/SendouForm";
import { useIsMounted } from "~/hooks/useIsMounted";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	navIconUrl,
	SENDOUQ_PAGE,
	SENDOUQ_SETTINGS_PAGE,
	SETTINGS_PAGE,
	soundPath,
} from "~/utils/urls";
import { action } from "../actions/q.settings.server";
import { BANNED_MAPS } from "../banned-maps";
import { ModeMapPoolPicker } from "../components/ModeMapPoolPicker";
import { PreferenceRadioGroup } from "../components/PreferenceRadioGroup";
import { loader } from "../loaders/q.settings.server";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "../q-settings-constants";
import {
	updateVoiceChatSchema,
	updateWeaponPoolSchema,
} from "../q-settings-schemas";
export { loader, action };

import styles from "./q.settings.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["q"],
	breadcrumb: () => [
		{
			imgPath: navIconUrl("sendouq"),
			href: SENDOUQ_PAGE,
			type: "IMAGE",
		},
		{
			imgPath: navIconUrl("settings"),
			href: SENDOUQ_SETTINGS_PAGE,
			type: "IMAGE",
		},
	],
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "SendouQ - Settings",
		location: args.location,
	});
};

export default function SendouQSettingsPage() {
	return (
		<Main>
			<MapPicker />
			<WeaponPool />
			<VoiceChat />
			<Sounds />
			<TrustedUsers />
			<Misc />
		</Main>
	);
}

function MapPicker() {
	const { t } = useTranslation(["q", "common"]);
	const data = useLoaderData<typeof loader>();
	const fetcher = useFetcher();
	const [preferences, setPreferences] = React.useState<UserMapModePreferences>(
		() => {
			if (!data.settings.mapModePreferences) {
				return {
					pool: [],
					modes: [],
				};
			}

			return {
				modes: data.settings.mapModePreferences.modes,
				pool: data.settings.mapModePreferences.pool.map((p) => ({
					mode: p.mode,
					stages: p.stages.filter((s) => !BANNED_MAPS[p.mode].includes(s)),
				})),
			};
		},
	);

	const handleModePreferenceChange = ({
		mode,
		preference,
	}: {
		mode: ModeShort;
		preference: Preference & "NEUTRAL";
	}) => {
		const newModePreferences = preferences.modes.filter(
			(map) => map.mode !== mode,
		);

		if (preference !== "NEUTRAL") {
			newModePreferences.push({
				mode,
				preference,
			});
		}

		setPreferences({
			...preferences,
			modes: newModePreferences,
		});
	};

	const poolsOk = () => {
		for (const mode of modesShort) {
			const mp = preferences.modes.find(
				(preference) => preference.mode === mode,
			);
			if (mp?.preference === "AVOID") continue;

			const pool = preferences.pool.find((p) => p.mode === mode);
			if (pool && pool.stages.length > AMOUNT_OF_MAPS_IN_POOL_PER_MODE) {
				return false;
			}
		}

		return true;
	};

	return (
		<details>
			<summary className={styles.summary}>
				<div>
					<span>{t("q:settings.maps.header")}</span> <MapIcon />
				</div>
			</summary>
			<fetcher.Form method="post" className="mb-4">
				<input
					type="hidden"
					name="mapModePreferences"
					value={JSON.stringify({
						...preferences,
						pool: preferences.pool.filter((p) => {
							const isAvoided =
								preferences.modes.find((m) => m.mode === p.mode)?.preference ===
								"AVOID";

							return !isAvoided;
						}),
					})}
				/>
				<div className="stack lg">
					<div className="stack items-center">
						{modesShort.map((modeShort) => {
							const preference = preferences.modes.find(
								(preference) => preference.mode === modeShort,
							);

							return (
								<div key={modeShort} className="stack horizontal xs my-1">
									<ModeImage mode={modeShort} width={32} />
									<PreferenceRadioGroup
										preference={preference?.preference}
										onPreferenceChange={(preference) =>
											handleModePreferenceChange({
												mode: modeShort,
												preference,
											})
										}
										aria-label={`Select preference towards ${modeShort}`}
									/>
								</div>
							);
						})}
					</div>

					<div className="stack lg">
						{modesShort.map((mode) => {
							const mp = preferences.modes.find(
								(preference) => preference.mode === mode,
							);
							if (mp?.preference === "AVOID") return null;

							return (
								<ModeMapPoolPicker
									key={mode}
									mode={mode}
									amountToPick={AMOUNT_OF_MAPS_IN_POOL_PER_MODE}
									pool={
										preferences.pool.find((p) => p.mode === mode)?.stages ?? []
									}
									onChange={(stages) => {
										const newPools = preferences.pool.filter(
											(p) => p.mode !== mode,
										);
										newPools.push({ mode, stages });
										setPreferences({
											...preferences,
											pool: newPools,
										});
									}}
								/>
							);
						})}
					</div>
				</div>
				<div className="mt-6">
					{poolsOk() ? (
						<SubmitButton
							_action="UPDATE_MAP_MODE_PREFERENCES"
							state={fetcher.state}
							className="mx-auto"
							size="big"
						>
							{t("common:actions.save")}
						</SubmitButton>
					) : (
						<div className="text-warning text-sm text-center font-bold">
							{t("q:settings.mapPool.notOk", {
								count: AMOUNT_OF_MAPS_IN_POOL_PER_MODE,
							})}
						</div>
					)}
				</div>
			</fetcher.Form>
		</details>
	);
}

function VoiceChat() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();

	return (
		<details>
			<summary className={styles.summary}>
				<div>
					<span>{t("q:settings.voiceChat.header")}</span> <Mic />
				</div>
			</summary>
			<div className="mb-4 ml-2-5">
				<SendouForm
					schema={updateVoiceChatSchema}
					defaultValues={{
						vc: data.settings.vc,
						languages: data.settings.languages ?? [],
					}}
				>
					{({ FormField }) => (
						<>
							<FormField name="vc" />
							<FormField name="languages" />
						</>
					)}
				</SendouForm>
			</div>
		</details>
	);
}

function WeaponPool() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();

	const defaultWeaponPool = (data.settings.qWeaponPool ?? []).map((w) => ({
		id: w.weaponSplId,
		isFavorite: Boolean(w.isFavorite),
	}));

	return (
		<details>
			<summary className={styles.summary}>
				<div>
					<span>{t("q:settings.weaponPool.header")}</span> <Puzzle />
				</div>
			</summary>
			<div className="mb-4">
				<SendouForm
					schema={updateWeaponPoolSchema}
					defaultValues={{
						weaponPool: defaultWeaponPool,
					}}
				>
					{({ FormField }) => <FormField name="weaponPool" />}
				</SendouForm>
			</div>
		</details>
	);
}

function Sounds() {
	const { t } = useTranslation(["q"]);
	const isMounted = useIsMounted();

	return (
		<details>
			<summary className={styles.summary}>
				<div>
					<span>{t("q:settings.sounds.header")}</span> <Volume2 />
				</div>
			</summary>
			<div className="mb-4">
				{isMounted && <SoundCheckboxes />}
				{isMounted && <SoundSlider />}
			</div>
		</details>
	);
}

function SoundCheckboxes() {
	const { t } = useTranslation(["q"]);

	const sounds = [
		{
			code: "sq_like",
			name: t("q:settings.sounds.likeReceived"),
		},
		{
			code: "sq_new-group",
			name: t("q:settings.sounds.groupNewMember"),
		},
		{
			code: "sq_match",
			name: t("q:settings.sounds.matchStarted"),
		},
		{
			code: "tournament_match",
			name: t("q:settings.sounds.tournamentMatchStarted"),
		},
	];

	// default to true
	const currentValue = (code: string) =>
		!localStorage.getItem(soundCodeToLocalStorageKey(code)) ||
		localStorage.getItem(soundCodeToLocalStorageKey(code)) === "true";

	const [soundValues, setSoundValues] = React.useState(
		Object.fromEntries(
			sounds.map((sound) => [sound.code, currentValue(sound.code)]),
		),
	);

	// toggle in local storage
	const toggleSound = (code: string) => {
		localStorage.setItem(
			soundCodeToLocalStorageKey(code),
			String(!currentValue(code)),
		);
		setSoundValues((prev) => ({
			...prev,
			[code]: !prev[code],
		}));
	};

	return (
		<div className="ml-2-5">
			{sounds.map((sound) => (
				<div key={sound.code}>
					<label className="stack horizontal xs items-center">
						<input
							type="checkbox"
							checked={soundValues[sound.code]}
							onChange={() => toggleSound(sound.code)}
						/>
						{sound.name}
					</label>
				</div>
			))}
		</div>
	);
}

function SoundSlider() {
	const [volume, setVolume] = useState(() => {
		return soundVolume() || 100;
	});

	const changeVolume = (event: React.ChangeEvent<HTMLInputElement>) => {
		const newVolume = Number.parseFloat(event.target.value);

		setVolume(newVolume);

		localStorage.setItem(
			"settings__sound-volume",
			String(Math.floor(newVolume)),
		);
	};

	const playSound = () => {
		const audio = new Audio(soundPath("sq_like"));
		audio.volume = soundVolume() / 100;
		void audio.play();
	};

	return (
		<div className="stack horizontal xs items-center ml-2-5">
			<Volume2 className={styles.volumeSliderIcon} />
			<input
				className={styles.volumeSliderInput}
				type="range"
				value={volume}
				onChange={changeVolume}
				onTouchEnd={playSound}
				onMouseUp={playSound}
			/>
		</div>
	);
}

function TrustedUsers() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();

	return (
		<details>
			<summary className={styles.summary}>
				<span>{t("q:settings.trusted.header")}</span> <Users />
			</summary>
			<div className="mb-4">
				{data.trusted.length > 0 ? (
					<div className="stack md mt-2">
						{data.trusted.map((trustedUser) => {
							return (
								<div
									key={trustedUser.id}
									className="stack horizontal xs items-center"
								>
									<Avatar user={trustedUser} size="xxs" />
									<div className="text-sm font-semi-bold">
										{trustedUser.username}
									</div>
									<FormWithConfirm
										dialogHeading={t("q:settings.trusted.confirm", {
											name: trustedUser.username,
										})}
										fields={[
											["_action", "REMOVE_TRUST"],
											["userToRemoveTrustFromId", trustedUser.id],
										]}
										submitButtonText="Remove"
									>
										<SendouButton
											className="small-text"
											variant="minimal-destructive"
											size="small"
											type="submit"
										>
											<Trash className="small-icon" />
										</SendouButton>
									</FormWithConfirm>
								</div>
							);
						})}
						<FormMessage type="info">
							{t("q:settings.trusted.trustedExplanation")}
						</FormMessage>
					</div>
				) : (
					<FormMessage type="info" className="mb-2">
						{t("q:settings.trusted.noTrustedExplanation")}
					</FormMessage>
				)}
				{data.team ? (
					<FormMessage type="info" className="mb-2">
						<Trans
							i18nKey="q:settings.trusted.teamExplanation"
							t={t}
							values={{
								name: data.team.name,
							}}
						>
							In addition to the users above, a member of your team{" "}
							<b>{data.team.name}</b> can you add you directly.
						</Trans>
					</FormMessage>
				) : null}
			</div>
		</details>
	);
}

function Misc() {
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["q"]);

	return (
		<details>
			<summary className={styles.summary}>
				<div>{t("q:settings.misc.header")}</div>
			</summary>
			<div className="mb-4 ml-2-5">
				<SendouForm
					schema={updateNoScreenSchema}
					defaultValues={{
						newValue: Boolean(data.settings.noScreen),
					}}
					action={SETTINGS_PAGE}
					autoSubmit
				>
					{({ FormField }) => <FormField name="newValue" />}
				</SendouForm>
			</div>
		</details>
	);
}
