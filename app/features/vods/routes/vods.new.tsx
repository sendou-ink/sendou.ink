import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { UserSearch } from "~/components/elements/UserSearch";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { WeaponSelect } from "~/components/WeaponSelect";
import { YouTubeEmbed } from "~/components/YouTubeEmbed";
import { useRecentlyReportedWeapons } from "~/features/sendouq/q-hooks";
import type { ArrayItemRenderContext, CustomFieldRenderProps } from "~/form";
import { FormField } from "~/form/FormField";
import { FormFieldWrapper } from "~/form/fields/FormFieldWrapper";
import type { WeaponPoolItem } from "~/form/fields/WeaponPoolFormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import { useHasRole } from "~/modules/permissions/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { Alert } from "../../../components/Alert";
import { action } from "../actions/vods.new.server";
import { loader } from "../loaders/vods.new.server";
import { vodFormBaseSchema } from "../vods-schemas";
import { extractYoutubeIdFromVideoUrl } from "../vods-utils";
import styles from "./vods.new.module.css";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["vods", "calendar"],
};

// xxx: clean up a lot

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

	const defaultValues = data.vodToEdit
		? vodToEditToFormValues(data.vodToEdit)
		: {
				type: "TOURNAMENT" as const,
				teamSize: "4" as const,
				pov: { type: "USER" as const },
				matches: [
					{
						mode: "SZ" as const,
						stageId: 1 as StageId,
						startsAt: "",
						weapon: undefined as MainWeaponId | undefined,
						weaponsTeamOne: [] as WeaponPoolItem[],
						weaponsTeamTwo: [] as WeaponPoolItem[],
					},
				],
			};

	return (
		<Main halfWidth className={styles.layout}>
			<SendouForm
				title={
					data.vodToEdit
						? t("vods:forms.title.edit")
						: t("vods:forms.title.create")
				}
				schema={vodFormBaseSchema}
				defaultValues={defaultValues}
			>
				<YouTubeEmbedWrapper onPlayerReady={setPlayer} />
				<VodFormFields player={player} />
			</SendouForm>
		</Main>
	);
}

type VodToEdit = NonNullable<Awaited<ReturnType<typeof loader>>["vodToEdit"]>;

function vodToEditToFormValues(vodToEdit: VodToEdit) {
	const teamSize = vodToEdit.teamSize ?? 4;
	const isCast = vodToEdit.type === "CAST";

	return {
		vodToEditId: vodToEdit.id,
		youtubeUrl: vodToEdit.youtubeUrl,
		title: vodToEdit.title,
		date: new Date(
			vodToEdit.date.year,
			vodToEdit.date.month,
			vodToEdit.date.day,
		),
		type: vodToEdit.type,
		teamSize: String(teamSize) as "1" | "2" | "3" | "4",
		pov: vodToEdit.pov,
		matches: vodToEdit.matches.map((match: VodToEdit["matches"][number]) => ({
			startsAt: match.startsAt,
			mode: match.mode,
			stageId: match.stageId as StageId,
			weapon: isCast ? undefined : (match.weapons[0] ?? undefined),
			weaponsTeamOne: isCast
				? match.weapons
						.slice(0, teamSize)
						.map((id: MainWeaponId) => ({ id, isFavorite: false }))
				: [],
			weaponsTeamTwo: isCast
				? match.weapons
						.slice(teamSize)
						.map((id: MainWeaponId) => ({ id, isFavorite: false }))
				: [],
		})),
	};
}

function YouTubeEmbedWrapper({
	onPlayerReady,
}: {
	onPlayerReady: (player: YT.Player) => void;
}) {
	const { values } = useFormFieldContext();
	const youtubeUrl = values.youtubeUrl as string | undefined;

	if (!youtubeUrl) return null;

	const videoId = extractYoutubeIdFromVideoUrl(youtubeUrl);
	if (!videoId) return null;

	return (
		<div className={styles.embedContainer}>
			<YouTubeEmbed id={videoId} enableApi onPlayerReady={onPlayerReady} />
		</div>
	);
}

function VodFormFields({ player }: { player: YT.Player | null }) {
	const { values } = useFormFieldContext();
	const videoType = values.type as string;

	return (
		<>
			<FormField name="youtubeUrl" />
			<FormField name="title" />
			<FormField name="date" />
			<FormField name="type" />

			{videoType === "CAST" ? <TeamSizeField /> : <PovFormField />}

			<FormField name="matches">
				{(ctx: ArrayItemRenderContext) => (
					<MatchFieldsetContent
						index={ctx.index}
						itemName={ctx.itemName}
						values={ctx.values as unknown as MatchFieldValues}
						formValues={ctx.formValues}
						setItemField={
							ctx.setItemField as <K extends keyof MatchFieldValues>(
								field: K,
								value: MatchFieldValues[K],
							) => void
						}
						canRemove={ctx.canRemove}
						remove={ctx.remove}
						player={player}
						videoType={videoType}
					/>
				)}
			</FormField>
		</>
	);
}

function TeamSizeField() {
	const { values, setValue } = useFormFieldContext();
	const matches = values.matches as Array<Record<string, unknown>>;

	const handleTeamSizeChange = (newValue: string | null) => {
		setValue("teamSize", newValue);

		if (matches && Array.isArray(matches)) {
			const clearedMatches = matches.map((match) => ({
				...match,
				weaponsTeamOne: [],
				weaponsTeamTwo: [],
			}));
			setValue("matches", clearedMatches);
		}
	};

	return (
		<FormField name="teamSize">
			{({ name, error, value }: CustomFieldRenderProps) => (
				<FormFieldWrapper
					id={name}
					name={name}
					label="forms:labels.vodTeamSize"
					error={error}
				>
					<select
						id={name}
						name={name}
						value={(value as string) ?? "4"}
						onChange={(e) => handleTeamSizeChange(e.target.value)}
					>
						<option value="1">1v1</option>
						<option value="2">2v2</option>
						<option value="3">3v3</option>
						<option value="4">4v4</option>
					</select>
				</FormFieldWrapper>
			)}
		</FormField>
	);
}

function PovFormField() {
	const { t } = useTranslation(["vods", "calendar"]);

	return (
		<FormField name="pov">
			{({ name, error, value, onChange }: CustomFieldRenderProps) => {
				const povValue = value as
					| { type: "USER"; userId?: number }
					| { type: "NAME"; name?: string }
					| undefined;

				if (!povValue) return null;

				const asPlainInput = povValue.type === "NAME";

				const toggleInputType = () => {
					if (asPlainInput) {
						onChange({ type: "USER", userId: undefined });
					} else {
						onChange({ type: "NAME", name: "" });
					}
				};

				return (
					<div className={styles.povField}>
						{asPlainInput ? (
							<>
								<Label required htmlFor={name}>
									{t("vods:forms.title.pov")}
								</Label>
								<input
									id={name}
									value={povValue.name ?? ""}
									onChange={(e) => {
										onChange({ type: "NAME", name: e.target.value });
									}}
								/>
							</>
						) : (
							<UserSearch
								label={t("vods:forms.title.pov")}
								isRequired
								name="pov-user"
								initialUserId={povValue.userId}
								onChange={(newUser) =>
									onChange({
										type: "USER",
										userId: newUser?.id,
									})
								}
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
						{error ? <FormMessage type="error">{error}</FormMessage> : null}
					</div>
				);
			}}
		</FormField>
	);
}

interface MatchFieldValues {
	startsAt: string;
	mode: string;
	stageId: StageId;
	weapon: MainWeaponId | null;
	weaponsTeamOne: WeaponPoolItem[];
	weaponsTeamTwo: WeaponPoolItem[];
}

type MatchFieldsetContentProps = ArrayItemRenderContext<MatchFieldValues> & {
	player: YT.Player | null;
	videoType: string;
};

function MatchFieldsetContent({
	index,
	itemName,
	values: matchValues,
	formValues,
	setItemField,
	canRemove,
	remove,
	player,
	videoType,
}: MatchFieldsetContentProps) {
	const { t } = useTranslation(["vods", "common"]);
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

	const allMatches = formValues.matches as MatchFieldValues[];
	const previousWeapons = index > 0 ? allMatches[index - 1] : null;

	return (
		<>
			<div className="stack horizontal sm items-center justify-between">
				<div className="text-md font-semi-bold">
					{t("vods:gameCount", { count: index + 1 })}
				</div>
				{canRemove ? (
					<SendouButton
						size="small"
						variant="minimal-destructive"
						onPress={remove}
					>
						{t("common:actions.remove")}
					</SendouButton>
				) : null}
			</div>

			<div className="stack md mt-4">
				<FormField name={`${itemName}.startsAt`}>
					{(props: CustomFieldRenderProps) => (
						<FormFieldWrapper
							id={`matches-${index}-startsAt`}
							name={`${itemName}.startsAt`}
							label="forms:labels.vodStartTimestamp"
							error={props.error}
						>
							<input
								id={`matches-${index}-startsAt`}
								value={matchValues.startsAt}
								onChange={(e) => setItemField("startsAt", e.target.value)}
								placeholder="10:22"
							/>
							{currentTime ? (
								<SendouButton
									variant="minimal"
									size="miniscule"
									onPress={() => setItemField("startsAt", currentTime)}
									className="mt-2"
								>
									{t("vods:forms.action.setAsCurrent", { time: currentTime })}
								</SendouButton>
							) : null}
						</FormFieldWrapper>
					)}
				</FormField>

				<FormField name={`${itemName}.mode`} />

				<FormField name={`${itemName}.stageId`} />

				<WeaponsField
					index={index}
					matchValues={matchValues}
					setItemField={setItemField}
					videoType={videoType}
					previousWeapons={previousWeapons}
					formValues={formValues}
				/>
			</div>
		</>
	);
}

function WeaponsField({
	index,
	matchValues,
	setItemField,
	videoType,
	previousWeapons,
	formValues,
}: {
	index: number;
	matchValues: MatchFieldValues;
	setItemField: <K extends keyof MatchFieldValues>(
		field: K,
		value: MatchFieldValues[K],
	) => void;
	videoType: string;
	previousWeapons: MatchFieldValues | null;
	formValues: Record<string, unknown>;
}) {
	const { t } = useTranslation(["vods", "forms"]);
	const teamSizeValue = formValues.teamSize as string | undefined;
	const teamSize = teamSizeValue ? Number(teamSizeValue) : 4;
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	const setWeapon = (value: MainWeaponId | null) => {
		setItemField("weapon", value);
		if (value) addRecentlyReportedWeapon(value);
	};

	const setTeamOneWeapon = (weaponIdx: number, value: MainWeaponId | null) => {
		const currentPool = [...(matchValues.weaponsTeamOne || [])];
		if (value) {
			currentPool[weaponIdx] = { id: value, isFavorite: false };
		} else {
			currentPool.splice(weaponIdx, 1);
		}
		setItemField("weaponsTeamOne", currentPool);
		if (value) addRecentlyReportedWeapon(value);
	};

	const setTeamTwoWeapon = (weaponIdx: number, value: MainWeaponId | null) => {
		const currentPool = [...(matchValues.weaponsTeamTwo || [])];
		if (value) {
			currentPool[weaponIdx] = { id: value, isFavorite: false };
		} else {
			currentPool.splice(weaponIdx, 1);
		}
		setItemField("weaponsTeamTwo", currentPool);
		if (value) addRecentlyReportedWeapon(value);
	};

	const copyFromPrevious = () => {
		if (!previousWeapons) return;

		if (videoType === "CAST") {
			setItemField("weaponsTeamOne", [...previousWeapons.weaponsTeamOne]);
			setItemField("weaponsTeamTwo", [...previousWeapons.weaponsTeamTwo]);
		} else {
			setItemField("weapon", previousWeapons.weapon);
		}
	};

	const hasPreviousWeapons = previousWeapons
		? videoType === "CAST"
			? previousWeapons.weaponsTeamOne.length > 0 ||
				previousWeapons.weaponsTeamTwo.length > 0
			: previousWeapons.weapon !== null
		: false;

	return (
		<div>
			{videoType === "CAST" ? (
				<div>
					<Label required>{t("forms:labels.vodWeaponsTeamOne")}</Label>
					<div className="stack sm">
						{new Array(teamSize).fill(null).map((_, i) => (
							<WeaponSelect
								key={i}
								isRequired
								testId={`match-${index}-team1-weapon-${i}`}
								value={
									(matchValues.weaponsTeamOne[i]?.id as MainWeaponId) ?? null
								}
								quickSelectWeaponsIds={recentlyReportedWeapons}
								onChange={(weaponId) => setTeamOneWeapon(i, weaponId)}
							/>
						))}
					</div>
					<div className="mt-4">
						<Label required>{t("forms:labels.vodWeaponsTeamTwo")}</Label>
						<div className="stack sm">
							{new Array(teamSize).fill(null).map((_, i) => (
								<WeaponSelect
									key={i}
									isRequired
									testId={`match-${index}-team2-weapon-${i}`}
									value={
										(matchValues.weaponsTeamTwo[i]?.id as MainWeaponId) ?? null
									}
									quickSelectWeaponsIds={recentlyReportedWeapons}
									onChange={(weaponId) => setTeamTwoWeapon(i, weaponId)}
								/>
							))}
						</div>
					</div>
				</div>
			) : (
				<WeaponSelect
					label={t("forms:labels.vodWeapon")}
					isRequired
					testId={`match-${index}-weapon`}
					value={matchValues.weapon}
					quickSelectWeaponsIds={recentlyReportedWeapons}
					onChange={setWeapon}
				/>
			)}
			{hasPreviousWeapons ? (
				<SendouButton
					variant="minimal"
					size="miniscule"
					onPress={copyFromPrevious}
					className="mt-2"
				>
					{t("vods:forms.action.copyFromPrevious")}
				</SendouButton>
			) : null}
		</div>
	);
}

function formatTime(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
