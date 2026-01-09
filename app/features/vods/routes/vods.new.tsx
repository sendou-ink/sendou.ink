import { useEffect, useState } from "react";
import {
	Controller,
	get,
	useFieldArray,
	useFormContext,
	useWatch,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import type { z } from "zod";
import { SendouButton } from "~/components/elements/Button";
import { UserSearch } from "~/components/elements/UserSearch";
import { FormMessage } from "~/components/FormMessage";
import { AddFieldButton } from "~/components/form/AddFieldButton";
import { InputGroupFormField } from "~/components/form/InputGroupFormField";
import { RemoveFieldButton } from "~/components/form/RemoveFieldButton";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { StageSelect } from "~/components/StageSelect";
import { WeaponSelect } from "~/components/WeaponSelect";
import { YouTubeEmbed } from "~/components/YouTubeEmbed";
import type { Tables } from "~/db/tables";
import { useRecentlyReportedWeapons } from "~/features/sendouq/q-hooks";
import { modesShort } from "~/modules/in-game-lists/modes";
import { useHasRole } from "~/modules/permissions/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { Alert } from "../../../components/Alert";
import { DateFormField } from "../../../components/form/DateFormField";
import { InputFormField } from "../../../components/form/InputFormField";
import { SelectFormField } from "../../../components/form/SelectFormField";
import { SendouForm } from "../../../components/form/SendouForm";
import { action } from "../actions/vods.new.server";
import { loader } from "../loaders/vods.new.server";
import { videoMatchTypes } from "../vods-constants";
import { videoInputSchema } from "../vods-schemas";
import { extractYoutubeIdFromVideoUrl } from "../vods-utils";
import styles from "./vods.new.module.css";
export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["vods", "calendar"],
};

export type VodFormFields = z.infer<typeof videoInputSchema>;

export default function NewVodPage() {
	const isVideoAdder = useHasRole("VIDEO_ADDER");
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["vods"]);
	const [player, setPlayer] = useState<YT.Player | null>(null);

	if (!isVideoAdder) {
		return (
			<Main className="stack items-center">
				<Alert variation="WARNING">{t("vods:gainPerms")}</Alert>
			</Main>
		);
	}

	return (
		<Main halfWidth className={styles.layout}>
			<SendouForm
				heading={
					data.vodToEdit
						? t("vods:forms.title.edit")
						: t("vods:forms.title.create")
				}
				schema={videoInputSchema}
				defaultValues={
					data.vodToEdit
						? {
								vodToEditId: data.vodToEdit.id,
								video: data.vodToEdit,
							}
						: {
								video: {
									type: "TOURNAMENT",
									teamSize: 4,
									matches: [
										{
											mode: "SZ",
											stageId: 1,
											startsAt: "",
											weapons: [],
										},
									],
									pov: { type: "USER" } as VodFormFields["video"]["pov"],
								},
							}
				}
			>
				<YouTubeEmbedWrapper onPlayerReady={setPlayer} />
				<FormFields player={player} />
			</SendouForm>
		</Main>
	);
}

function YouTubeEmbedWrapper({
	onPlayerReady,
}: {
	onPlayerReady: (player: YT.Player) => void;
}) {
	const youtubeUrl = useWatch<VodFormFields>({
		name: "video.youtubeUrl",
	}) as string | undefined;

	if (!youtubeUrl) return null;

	const videoId = extractYoutubeIdFromVideoUrl(youtubeUrl);
	if (!videoId) return null;

	return (
		<div className={styles.embedContainer}>
			<YouTubeEmbed id={videoId} enableApi onPlayerReady={onPlayerReady} />
		</div>
	);
}

function FormFields({ player }: { player: YT.Player | null }) {
	const { t } = useTranslation(["vods"]);
	const videoType = useWatch({
		name: "video.type",
	}) as VodFormFields["video"]["type"];

	return (
		<>
			<InputFormField<VodFormFields>
				label={t("vods:forms.title.youtubeUrl")}
				name="video.youtubeUrl"
				placeholder="https://www.youtube.com/watch?v=-dQ6JsVIKdY"
				required
				size="medium"
			/>

			<InputFormField<VodFormFields>
				label={t("vods:forms.title.videoTitle")}
				name="video.title"
				placeholder="[SCL 47] (Grand Finals) Team Olive vs. Kraken Paradise"
				required
				size="medium"
			/>

			<DateFormField<VodFormFields>
				label={t("vods:forms.title.videoDate")}
				name="video.date"
				required
				size="extra-small"
			/>

			<SelectFormField<VodFormFields>
				label={t("vods:forms.title.type")}
				name="video.type"
				values={videoMatchTypes.map((role) => ({
					value: role,
					label: t(`vods:type.${role}`),
				}))}
				required
			/>

			{videoType === "CAST" ? <TeamSizeField /> : <PovFormField />}

			<MatchesFormfield videoType={videoType} player={player} />
		</>
	);
}

function TeamSizeField() {
	const { t } = useTranslation(["vods"]);
	const { setValue } = useFormContext<VodFormFields>();
	const matches = useWatch<VodFormFields>({
		name: "video.matches",
	}) as VodFormFields["video"]["matches"];

	return (
		<Controller
			control={useFormContext<VodFormFields>().control}
			name="video.teamSize"
			render={({ field: { onChange, value } }) => {
				return (
					<div>
						<Label required htmlFor="teamSize">
							{t("vods:forms.title.teamSize")}
						</Label>
						<select
							id="teamSize"
							value={value ?? 4}
							onChange={(e) => {
								const newTeamSize = Number(e.target.value);
								onChange(newTeamSize);

								if (matches && Array.isArray(matches)) {
									matches.forEach((_, idx) => {
										setValue(`video.matches.${idx}.weapons`, []);
									});
								}
							}}
							required
						>
							<option value={1}>{t("vods:teamSize.1v1")}</option>
							<option value={2}>{t("vods:teamSize.2v2")}</option>
							<option value={3}>{t("vods:teamSize.3v3")}</option>
							<option value={4}>{t("vods:teamSize.4v4")}</option>
						</select>
					</div>
				);
			}}
		/>
	);
}

function PovFormField() {
	const { t } = useTranslation(["vods", "calendar"]);
	const methods = useFormContext<VodFormFields>();

	const povNameError = get(methods.formState.errors, "video.pov.name");

	return (
		<Controller
			control={methods.control}
			name="video.pov"
			render={({
				field: { onChange, onBlur, value },
				fieldState: { error },
			}) => {
				// biome-ignore lint/complexity/noUselessFragments: Biome upgrade
				if (!value) return <></>;

				const asPlainInput = value.type === "NAME";

				const toggleInputType = () => {
					if (asPlainInput) {
						onChange({ type: "USER", userId: undefined });
					} else {
						onChange({ type: "NAME", name: "" });
					}
				};

				return (
					<div>
						{asPlainInput ? (
							<>
								<Label required htmlFor="pov">
									{t("vods:forms.title.pov")}
								</Label>
								<input
									id="pov"
									value={value.name ?? ""}
									onChange={(e) => {
										onChange({ type: "NAME", name: e.target.value });
									}}
									onBlur={onBlur}
								/>
							</>
						) : (
							<UserSearch
								label={t("vods:forms.title.pov")}
								isRequired
								name="team-player"
								initialUserId={value.userId}
								onChange={(newUser) =>
									onChange({
										type: "USER",
										userId: newUser?.id,
									})
								}
								onBlur={onBlur}
							/>
						)}
						<SendouButton
							size="small"
							variant="minimal"
							onPress={toggleInputType}
							className="outline-theme mt-2"
						>
							{asPlainInput
								? t("calendar:forms.team.player.addAsUser")
								: t("calendar:forms.team.player.addAsText")}
						</SendouButton>
						{error && (
							<FormMessage type="error">{error.message as string}</FormMessage>
						)}
						{povNameError && (
							<FormMessage type="error">
								{povNameError.message as string}
							</FormMessage>
						)}
					</div>
				);
			}}
		/>
	);
}

function MatchesFormfield({
	videoType,
	player,
}: {
	videoType: Tables["Video"]["type"];
	player: YT.Player | null;
}) {
	const {
		formState: { errors },
	} = useFormContext<VodFormFields>();
	const { fields, append, remove } = useFieldArray<VodFormFields>({
		name: "video.matches",
	});

	const rootError = errors.video?.matches?.root;

	return (
		<div>
			<div className="stack md">
				{fields.map((field, i) => {
					return (
						<MatchesFieldset
							key={field.id}
							idx={i}
							remove={remove}
							canRemove={fields.length > 1}
							videoType={videoType}
							player={player}
						/>
					);
				})}
				<AddFieldButton
					onClick={() => {
						append({
							mode: "SZ",
							stageId: 1,
							startsAt: "",
							weapons: [],
						});
					}}
				/>
				{rootError && (
					<FormMessage type="error">{rootError.message as string}</FormMessage>
				)}
			</div>
		</div>
	);
}

function MatchesFieldset({
	idx,
	remove,
	canRemove,
	videoType,
	player,
}: {
	idx: number;
	remove: (idx: number) => void;
	canRemove: boolean;
	videoType: Tables["Video"]["type"];
	player: YT.Player | null;
}) {
	const { t } = useTranslation(["vods", "game-misc"]);
	const { setValue } = useFormContext<VodFormFields>();
	const [currentTime, setCurrentTime] = useState<string>("");

	useEffect(() => {
		if (!player) return;

		const interval = setInterval(() => {
			try {
				const time = player.getCurrentTime();
				if (time) {
					setCurrentTime(formatTime(time));
				}
			} catch {
				// Silently ignore errors when getting current time
			}
		}, 250);

		return () => clearInterval(interval);
	}, [player]);

	return (
		<div className="stack md">
			<div className="stack horizontal sm">
				<h2 className="text-md">{t("vods:gameCount", { count: idx + 1 })}</h2>
				{canRemove ? <RemoveFieldButton onClick={() => remove(idx)} /> : null}
			</div>

			<div>
				<InputFormField<VodFormFields>
					required
					label={t("vods:forms.title.startTimestamp")}
					name={`video.matches.${idx}.startsAt`}
					placeholder="10:22"
				/>
				{currentTime ? (
					<SendouButton
						variant="minimal"
						size="miniscule"
						onPress={() =>
							setValue(`video.matches.${idx}.startsAt`, currentTime)
						}
						className="mt-2"
					>
						{t("vods:forms.action.setAsCurrent", { time: currentTime })}
					</SendouButton>
				) : null}
			</div>

			<InputGroupFormField<VodFormFields>
				type="radio"
				label={t("vods:forms.title.mode")}
				name={`video.matches.${idx}.mode`}
				values={modesShort.map((mode) => ({
					value: mode,
					label: t(`game-misc:MODE_SHORT_${mode}`),
				}))}
				direction="horizontal"
			/>

			<Controller
				control={useFormContext<VodFormFields>().control}
				name={`video.matches.${idx}.stageId`}
				render={({ field: { onChange, value } }) => (
					<StageSelect
						isRequired
						label={t("vods:forms.title.stage")}
						value={value}
						onChange={onChange}
					/>
				)}
			/>

			<WeaponsField idx={idx} videoType={videoType} />
		</div>
	);
}

function WeaponsField({
	idx,
	videoType,
}: {
	idx: number;
	videoType: Tables["Video"]["type"];
}) {
	const { t } = useTranslation(["vods"]);
	const watchedTeamSize = useWatch<VodFormFields>({
		name: "video.teamSize",
	});
	const teamSize = typeof watchedTeamSize === "number" ? watchedTeamSize : 4;
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();
	const matches = useWatch<VodFormFields>({
		name: "video.matches",
	}) as VodFormFields["video"]["matches"];

	return (
		<Controller
			control={useFormContext<VodFormFields>().control}
			name={`video.matches.${idx}.weapons`}
			render={({ field: { onChange, value } }) => {
				const previousWeapons =
					idx > 0 && matches?.[idx - 1]?.weapons
						? matches[idx - 1].weapons
						: null;
				return (
					<div>
						{videoType === "CAST" ? (
							<div>
								<Label required>{t("vods:forms.title.weaponsTeamOne")}</Label>
								<div className="stack sm">
									{new Array(teamSize).fill(null).map((_, i) => {
										return (
											<WeaponSelect
												key={i}
												isRequired
												testId={`player-${i}-weapon`}
												value={value[i] ?? null}
												quickSelectWeaponsIds={recentlyReportedWeapons}
												onChange={(weaponId) => {
													const weapons = [...value];
													weapons[i] = weaponId;

													onChange(weapons);
													if (weaponId) {
														addRecentlyReportedWeapon(weaponId);
													}
												}}
											/>
										);
									})}
								</div>
								<div className="mt-4">
									<Label required>{t("vods:forms.title.weaponsTeamTwo")}</Label>
									<div className="stack sm">
										{new Array(teamSize).fill(null).map((_, i) => {
											const adjustedI = i + teamSize;
											return (
												<WeaponSelect
													key={adjustedI}
													isRequired
													testId={`player-${adjustedI}-weapon`}
													value={value[adjustedI] ?? null}
													quickSelectWeaponsIds={recentlyReportedWeapons}
													onChange={(weaponId) => {
														const weapons = [...value];
														weapons[adjustedI] = weaponId;

														onChange(weapons);
														if (weaponId) {
															addRecentlyReportedWeapon(weaponId);
														}
													}}
												/>
											);
										})}
									</div>
								</div>
							</div>
						) : (
							<WeaponSelect
								label={t("vods:forms.title.weapon")}
								isRequired
								testId={`match-${idx}-weapon`}
								value={value[0] ?? null}
								quickSelectWeaponsIds={recentlyReportedWeapons}
								onChange={(weaponId) => {
									onChange([weaponId]);
									if (weaponId) {
										addRecentlyReportedWeapon(weaponId);
									}
								}}
							/>
						)}
						{previousWeapons && previousWeapons.length > 0 ? (
							<SendouButton
								variant="minimal"
								size="miniscule"
								onPress={() => {
									onChange([...previousWeapons]);
								}}
								className="mt-2"
							>
								{t("vods:forms.action.copyFromPrevious")}
							</SendouButton>
						) : null}
					</div>
				);
			}}
		/>
	);
}

function formatTime(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
