import { RadioGroup } from "@headlessui/react";
import type {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	MetaFunction,
} from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trans } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Button } from "~/components/Button";
import { WeaponCombobox } from "~/components/Combobox";
import { FormMessage } from "~/components/FormMessage";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { ModeImage, WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { CrossIcon } from "~/components/icons/Cross";
import { MapIcon } from "~/components/icons/Map";
import { MicrophoneFilledIcon } from "~/components/icons/MicrophoneFilled";
import { PuzzleIcon } from "~/components/icons/Puzzle";
import { SpeakerFilledIcon } from "~/components/icons/SpeakerFilled";
import { TrashIcon } from "~/components/icons/Trash";
import { UsersIcon } from "~/components/icons/Users";
import type { Preference, Tables, UserMapModePreferences } from "~/db/tables";
import { requireUserId } from "~/features/auth/core/user.server";
import {
	soundCodeToLocalStorageKey,
	soundVolume,
} from "~/features/chat/chat-utils";
import * as QSettingsRepository from "~/features/sendouq-settings/QSettingsRepository.server";
import { useIsMounted } from "~/hooks/useIsMounted";
import { languagesUnified } from "~/modules/i18n/config";
import type { MainWeaponId, ModeShort } from "~/modules/in-game-lists";
import { modesShort } from "~/modules/in-game-lists/modes";
import {
	type SendouRouteHandle,
	parseRequestPayload,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import {
	SENDOUQ_PAGE,
	SENDOUQ_SETTINGS_PAGE,
	navIconUrl,
	preferenceEmojiUrl,
	soundPath,
} from "~/utils/urls";
import { BANNED_MAPS } from "../banned-maps";
import { ModeMapPoolPicker } from "../components/ModeMapPoolPicker";
import {
	AMOUNT_OF_MAPS_IN_POOL_PER_MODE,
	SENDOUQ_WEAPON_POOL_MAX_SIZE,
} from "../q-settings-constants";
import { settingsActionSchema } from "../q-settings-schemas.server";
import "../q-settings.css";
import { SendouSwitch } from "~/components/elements/Switch";
import { metaTags } from "~/utils/remix";

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

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUserId(request);
	const data = await parseRequestPayload({
		request,
		schema: settingsActionSchema,
	});

	switch (data._action) {
		case "UPDATE_MAP_MODE_PREFERENCES": {
			await QSettingsRepository.updateUserMapModePreferences({
				mapModePreferences: data.mapModePreferences,
				userId: user.id,
			});
			break;
		}
		case "UPDATE_VC": {
			await QSettingsRepository.updateVoiceChat({
				userId: user.id,
				vc: data.vc,
				languages: data.languages,
			});
			break;
		}
		case "UPDATE_SENDOUQ_WEAPON_POOL": {
			await QSettingsRepository.updateSendouQWeaponPool({
				userId: user.id,
				weaponPool: data.weaponPool,
			});
			break;
		}
		case "UPDATE_NO_SCREEN": {
			await QSettingsRepository.updateNoScreen({
				userId: user.id,
				noScreen: Number(data.noScreen),
			});
			break;
		}
		case "REMOVE_TRUST": {
			await QSettingsRepository.deleteTrustedUser({
				trustGiverUserId: user.id,
				trustReceiverUserId: data.userToRemoveTrustFromId,
			});
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	return { ok: true };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await requireUserId(request);

	return {
		settings: await QSettingsRepository.settingsByUserId(user.id),
		trusted: await QSettingsRepository.findTrustedUsersByGiverId(user.id),
		team: await QSettingsRepository.currentTeamByUserId(user.id),
	};
};

export default function SendouQSettingsPage() {
	return (
		<Main className="stack sm">
			<div className="stack">
				<MapPicker />
				<WeaponPool />
				<VoiceChat />
				<Sounds />
				<TrustedUsers />
				<Misc />
			</div>
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
			if (!pool || pool.stages.length !== AMOUNT_OF_MAPS_IN_POOL_PER_MODE) {
				return false;
			}
		}

		return true;
	};

	return (
		<details>
			<summary className="q-settings__summary">
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

function PreferenceRadioGroup({
	preference,
	onPreferenceChange,
}: {
	preference?: Preference;
	onPreferenceChange: (preference: Preference & "NEUTRAL") => void;
}) {
	const { t } = useTranslation(["q"]);

	return (
		<RadioGroup
			value={preference ?? "NEUTRAL"}
			onChange={(newPreference) =>
				onPreferenceChange(newPreference as Preference & "NEUTRAL")
			}
			className="stack horizontal xs"
		>
			<RadioGroup.Option value="AVOID">
				{({ checked }) => (
					<span
						className={clsx("q-settings__radio", {
							"q-settings__radio__checked": checked,
						})}
					>
						<img
							src={preferenceEmojiUrl("AVOID")}
							className="q-settings__radio__emoji"
							width={18}
							alt="Avoid emoji"
						/>
						{t("q:settings.maps.avoid")}
					</span>
				)}
			</RadioGroup.Option>
			<RadioGroup.Option value="NEUTRAL">
				{({ checked }) => (
					<span
						className={clsx("q-settings__radio", {
							"q-settings__radio__checked": checked,
						})}
					>
						<img
							src={preferenceEmojiUrl()}
							className="q-settings__radio__emoji"
							width={18}
							alt="Neutral emoji"
						/>
						{t("q:settings.maps.neutral")}
					</span>
				)}
			</RadioGroup.Option>
			<RadioGroup.Option value="PREFER">
				{({ checked }) => (
					<span
						className={clsx("q-settings__radio", {
							"q-settings__radio__checked": checked,
						})}
					>
						<img
							src={preferenceEmojiUrl("PREFER")}
							className="q-settings__radio__emoji"
							width={18}
							alt="Prefer emoji"
						/>
						{t("q:settings.maps.prefer")}
					</span>
				)}
			</RadioGroup.Option>
		</RadioGroup>
	);
}

function VoiceChat() {
	const { t } = useTranslation(["common", "q"]);
	const fetcher = useFetcher();

	return (
		<details>
			<summary className="q-settings__summary">
				<div>
					<span>{t("q:settings.voiceChat.header")}</span>{" "}
					<MicrophoneFilledIcon />
				</div>
			</summary>
			<fetcher.Form method="post" className="mb-4 ml-2-5 stack sm">
				<VoiceChatAbility />
				<Languages />
				<div>
					<SubmitButton
						size="big"
						className="mt-2 mx-auto"
						_action="UPDATE_VC"
						state={fetcher.state}
					>
						{t("common:actions.save")}
					</SubmitButton>
				</div>
			</fetcher.Form>
		</details>
	);
}

function VoiceChatAbility() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();

	const label = (vc: Tables["User"]["vc"]) => {
		switch (vc) {
			case "YES":
				return t("q:settings.voiceChat.canVC.yes");
			case "NO":
				return t("q:settings.voiceChat.canVC.no");
			case "LISTEN_ONLY":
				return t("q:settings.voiceChat.canVC.listenOnly");
			default:
				assertUnreachable(vc);
		}
	};

	return (
		<div className="stack">
			<label>{t("q:settings.voiceChat.canVC.header")}</label>
			{(["YES", "NO", "LISTEN_ONLY"] as const).map((option) => {
				return (
					<div key={option} className="stack sm horizontal items-center">
						<input
							type="radio"
							name="vc"
							id={option}
							value={option}
							required
							defaultChecked={data.settings.vc === option}
						/>
						<label htmlFor={option} className="mb-0 text-main-forced">
							{label(option)}
						</label>
					</div>
				);
			})}
		</div>
	);
}

function Languages() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const [value, setValue] = React.useState(data.settings.languages ?? []);

	return (
		<div className="stack">
			<input type="hidden" name="languages" value={JSON.stringify(value)} />
			<label>{t("q:settings.voiceChat.languages.header")}</label>
			<select
				className="w-max"
				onChange={(e) => {
					const newLanguages = [...value, e.target.value].sort((a, b) =>
						a.localeCompare(b),
					);
					setValue(newLanguages);
				}}
			>
				<option value="">
					{t("q:settings.voiceChat.languages.placeholder")}
				</option>
				{languagesUnified
					.filter((lang) => !value.includes(lang.code))
					.map((option) => {
						return (
							<option key={option.code} value={option.code}>
								{option.name}
							</option>
						);
					})}
			</select>
			<div className="mt-2">
				{value.map((code) => {
					const name = languagesUnified.find((l) => l.code === code)?.name;

					return (
						<div key={code} className="stack horizontal items-center sm">
							{name}{" "}
							<Button
								icon={<CrossIcon />}
								variant="minimal-destructive"
								onClick={() => {
									const newLanguages = value.filter(
										(codeInArr) => codeInArr !== code,
									);
									setValue(newLanguages);
								}}
							/>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function WeaponPool() {
	const { t } = useTranslation(["common", "q"]);
	const data = useLoaderData<typeof loader>();
	const [weapons, setWeapons] = React.useState(data.settings.qWeaponPool ?? []);
	const fetcher = useFetcher();

	const latestWeapon = weapons[weapons.length - 1];

	return (
		<details>
			<summary className="q-settings__summary">
				<div>
					<span>{t("q:settings.weaponPool.header")}</span> <PuzzleIcon />
				</div>
			</summary>
			<fetcher.Form method="post" className="mb-4 stack items-center">
				<input
					type="hidden"
					name="weaponPool"
					value={JSON.stringify(weapons)}
				/>
				<div className="q-settings__weapon-pool-select-container">
					{weapons.length < SENDOUQ_WEAPON_POOL_MAX_SIZE ? (
						<div>
							<WeaponCombobox
								inputName="weapon"
								id="weapon"
								onChange={(weapon) => {
									if (!weapon) return;
									setWeapons([
										...weapons,
										Number(weapon.value) as MainWeaponId,
									]);
								}}
								// empty on selection
								key={latestWeapon ?? "empty"}
								weaponIdsToOmit={new Set(weapons)}
								fullWidth
							/>
						</div>
					) : (
						<span className="text-xs text-info">
							{t("q:settings.weaponPool.full")}
						</span>
					)}
				</div>
				<div className="stack horizontal sm justify-center">
					{weapons.map((weapon) => {
						return (
							<div key={weapon} className="stack xs">
								<div>
									<WeaponImage
										weaponSplId={weapon}
										variant="badge"
										width={38}
										height={38}
									/>
								</div>
								<div className="stack sm horizontal items-center justify-center">
									<Button
										icon={<TrashIcon />}
										variant="minimal-destructive"
										aria-label="Delete weapon"
										onClick={() =>
											setWeapons(weapons.filter((w) => w !== weapon))
										}
										size="tiny"
									/>
								</div>
							</div>
						);
					})}
				</div>
				<div className="mt-6">
					<SubmitButton
						size="big"
						className="mx-auto"
						_action="UPDATE_SENDOUQ_WEAPON_POOL"
						state={fetcher.state}
					>
						{t("common:actions.save")}
					</SubmitButton>
				</div>
			</fetcher.Form>
		</details>
	);
}

function Sounds() {
	const { t } = useTranslation(["q"]);
	const isMounted = useIsMounted();

	return (
		<details>
			<summary className="q-settings__summary">
				<div>
					<span>{t("q:settings.sounds.header")}</span> <SpeakerFilledIcon />
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
			<SpeakerFilledIcon className="q-settings__volume-slider-icon" />
			<input
				className="q-settings__volume-slider-input"
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
			<summary className="q-settings__summary">
				<span>{t("q:settings.trusted.header")}</span> <UsersIcon />
			</summary>
			<div className="mb-4">
				{data.trusted.length > 0 ? (
					<>
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
											deleteButtonText="Remove"
										>
											<Button
												className="build__small-text"
												variant="minimal-destructive"
												size="tiny"
												type="submit"
											>
												<TrashIcon className="build__icon" />
											</Button>
										</FormWithConfirm>
									</div>
								);
							})}
							<FormMessage type="info">
								{t("q:settings.trusted.trustedExplanation")}
							</FormMessage>
						</div>
					</>
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
	const [checked, setChecked] = React.useState(Boolean(data.settings.noScreen));
	const { t } = useTranslation(["common", "q", "weapons"]);
	const fetcher = useFetcher();

	return (
		<details>
			<summary className="q-settings__summary">
				<div>{t("q:settings.misc.header")}</div>
			</summary>
			<fetcher.Form method="post" className="mb-4 ml-2-5 stack sm">
				<div className="stack horizontal xs items-center">
					<SendouSwitch
						isSelected={checked}
						onChange={setChecked}
						id="noScreen"
						name="noScreen"
					/>
					<label className="mb-0" htmlFor="noScreen">
						{t("q:settings.avoid.label", {
							special: t("weapons:SPECIAL_19"),
						})}
					</label>
				</div>
				<div className="mt-6">
					<SubmitButton
						size="big"
						className="mx-auto"
						_action="UPDATE_NO_SCREEN"
						state={fetcher.state}
					>
						{t("common:actions.save")}
					</SubmitButton>
				</div>
			</fetcher.Form>
		</details>
	);
}
