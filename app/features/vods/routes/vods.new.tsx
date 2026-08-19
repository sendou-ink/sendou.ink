import clsx from "clsx";
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
import type { ArrayItemRenderContext, CustomFieldRenderProps } from "~/form";
import type { WeaponPoolItem } from "~/form/fields/WeaponPoolFormField";
import type { FormRenderProps } from "~/form/SendouForm";
import {
	SendouForm,
	useFormValue,
	useOptionalFormFieldContext,
} from "~/form/SendouForm";
import { useIsomorphicLayoutEffect } from "~/hooks/useIsomorphicLayoutEffect";
import { useRecentlyReportedWeapons } from "~/hooks/useRecentlyReportedWeapons";
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
		: data.vodPrefill
			? vodPrefillToFormValues(data.vodPrefill)
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
				{({ FormField }) => (
					<>
						<YouTubeEmbedWrapper onPlayerReady={setPlayer} />
						<VodFormFields player={player} FormField={FormField} />
					</>
				)}
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

type VodPrefill = NonNullable<Awaited<ReturnType<typeof loader>>["vodPrefill"]>;

/**
 * Prefill from the emberz VoD parser's `ingest` search param (see the loader):
 * detected matches with anything the detectors missed left at the blank form's
 * defaults for the user to fill. CAST weapons are the alpha team's four slots
 * then bravo's; unread slots are dropped so the remaining empty (required)
 * selects surface them. A non-CAST VoD instead takes the POV player's weapon,
 * which the scan only knows when a scoreboard identified their seat.
 */
function vodPrefillToFormValues(prefill: VodPrefill) {
	const teamSize = 4;
	const isCast = prefill.type === "CAST";

	return {
		type: prefill.type ?? ("TOURNAMENT" as const),
		teamSize: "4" as const,
		pov: { type: "USER" as const },
		matches: prefill.matches.map((match) => ({
			startsAt: match.startsAt,
			mode: match.mode ?? ("SZ" as const),
			stageId: (match.stageId ?? 1) as StageId,
			weapon: isCast
				? undefined
				: ((match.povWeapon ?? undefined) as MainWeaponId | undefined),
			weaponsTeamOne: isCast
				? weaponPoolFromPrefill(match.weapons.slice(0, teamSize))
				: ([] as WeaponPoolItem[]),
			weaponsTeamTwo: isCast
				? weaponPoolFromPrefill(match.weapons.slice(teamSize, teamSize * 2))
				: ([] as WeaponPoolItem[]),
		})),
	};
}

function weaponPoolFromPrefill(
	weapons: VodPrefill["matches"][number]["weapons"],
): WeaponPoolItem[] {
	return weapons
		.filter((id): id is MainWeaponId => id !== null)
		.map((id) => ({ id, isFavorite: false }));
}

function YouTubeEmbedWrapper({
	onPlayerReady,
}: {
	onPlayerReady: (player: YT.Player) => void;
}) {
	const floatWidth = useFloatingEmbedWidth();
	const youtubeUrl = useFormValue("youtubeUrl") as string | undefined;

	if (!youtubeUrl) return null;

	const videoId = extractYoutubeIdFromVideoUrl(youtubeUrl);
	if (!videoId) return null;

	return (
		<div
			className={clsx(styles.embedRail, { [styles.floating]: floatWidth })}
			style={floatWidth ? { width: floatWidth } : undefined}
		>
			<div className={styles.embedContainer}>
				<YouTubeEmbed id={videoId} enableApi onPlayerReady={onPlayerReady} />
			</div>
		</div>
	);
}

const EMBED_RAIL_GAP = 24; // mirrors var(--s-6)
const EMBED_FLOAT_WIDTHS = [400, 320] as const;

/**
 * Returns the width to float the embed at when the form's left margin can fit
 * it (widest that fits), or `null` to leave it in flow above the fields.
 * Measures the form's actual left margin so it accounts for the side nav being
 * collapsed and the chat sidebar being open, neither of which a media query can
 * see.
 */
function useFloatingEmbedWidth(): number | null {
	const [leftMargin, setLeftMargin] = useState(0);

	useIsomorphicLayoutEffect(() => {
		const main = document.querySelector("main");
		const container = main?.parentElement;
		if (!main || !container) return;

		const measure = () => {
			setLeftMargin(
				main.getBoundingClientRect().left -
					container.getBoundingClientRect().left,
			);
		};

		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(container);

		return () => observer.disconnect();
	}, []);

	return (
		EMBED_FLOAT_WIDTHS.find((width) => leftMargin >= width + EMBED_RAIL_GAP) ??
		null
	);
}

type VodFormFieldComponent = FormRenderProps<
	typeof vodFormBaseSchema.entries
>["FormField"];

function VodFormFields({
	player,
	FormField,
}: {
	player: YT.Player | null;
	FormField: VodFormFieldComponent;
}) {
	const videoType = useFormValue("type") as string;

	return (
		<>
			<FormField name="youtubeUrl" />
			<FormField name="title" />
			<FormField name="date" />
			<FormField name="type" />

			{videoType === "CAST" ? (
				<TeamSizeField FormField={FormField} />
			) : (
				<PovFormField FormField={FormField} />
			)}

			<FormField name="matches">
				{(ctx: ArrayItemRenderContext) => (
					<MatchFieldsetContent
						index={ctx.index}
						itemName={ctx.itemName}
						values={ctx.values as unknown as MatchFieldValues}
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
						FormField={FormField}
					/>
				)}
			</FormField>
		</>
	);
}

function TeamSizeField({ FormField }: { FormField: VodFormFieldComponent }) {
	const context = useOptionalFormFieldContext();

	// The weapon count per match is tied to the team size, so any already picked
	// weapons would no longer fit the new size.
	const clearMatchWeapons = () => {
		context?.setValueFromPrev("matches", (prev) =>
			((prev ?? []) as Array<Record<string, unknown>>).map((match) => ({
				...match,
				weaponsTeamOne: [],
				weaponsTeamTwo: [],
			})),
		);
	};

	return <FormField name="teamSize" onValueChange={clearMatchWeapons} />;
}

function PovFormField({ FormField }: { FormField: VodFormFieldComponent }) {
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
							className="mt-2"
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
	FormField: VodFormFieldComponent;
};

function MatchFieldsetContent({
	index,
	itemName,
	values: matchValues,
	setItemField,
	canRemove,
	remove,
	player,
	videoType,
	FormField,
}: MatchFieldsetContentProps) {
	const { t } = useTranslation(["vods", "common"]);
	const [currentTime, setCurrentTime] = useState<string>("");
	const previousWeapons = (useFormValue(`matches[${index - 1}]`) ??
		null) as MatchFieldValues | null;

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
				<div>
					<FormField name={`${itemName}.startsAt`} />
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
				</div>

				<FormField name={`${itemName}.mode`} />

				<FormField name={`${itemName}.stageId`} />

				<WeaponsField
					index={index}
					matchValues={matchValues}
					setItemField={setItemField}
					videoType={videoType}
					previousWeapons={previousWeapons}
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
}: {
	index: number;
	matchValues: MatchFieldValues;
	setItemField: <K extends keyof MatchFieldValues>(
		field: K,
		value: MatchFieldValues[K],
	) => void;
	videoType: string;
	previousWeapons: MatchFieldValues | null;
}) {
	const { t } = useTranslation(["vods", "forms"]);
	const teamSizeValue = useFormValue("teamSize") as string | undefined;
	const teamSize = teamSizeValue ? Number(teamSizeValue) : 4;
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	const setWeapon = (value: MainWeaponId | null) => {
		setItemField("weapon", value);
		if (typeof value === "number") addRecentlyReportedWeapon(value);
	};

	const setTeamWeapon = (
		team: "weaponsTeamOne" | "weaponsTeamTwo",
		weaponIdx: number,
		value: MainWeaponId | null,
	) => {
		const currentPool = [...(matchValues[team] || [])];
		if (typeof value === "number") {
			currentPool[weaponIdx] = { id: value, isFavorite: false };
		} else {
			currentPool.splice(weaponIdx, 1);
		}
		setItemField(team, currentPool);
		if (typeof value === "number") addRecentlyReportedWeapon(value);
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
					<TeamWeaponSelects
						label={t("forms:labels.vodWeaponsTeamOne")}
						teamSize={teamSize}
						matchIndex={index}
						teamNumber={1}
						weapons={matchValues.weaponsTeamOne}
						quickSelectWeaponsIds={recentlyReportedWeapons}
						onChange={(weaponIdx, weaponId) =>
							setTeamWeapon("weaponsTeamOne", weaponIdx, weaponId)
						}
					/>
					<TeamWeaponSelects
						label={t("forms:labels.vodWeaponsTeamTwo")}
						teamSize={teamSize}
						matchIndex={index}
						teamNumber={2}
						weapons={matchValues.weaponsTeamTwo}
						quickSelectWeaponsIds={recentlyReportedWeapons}
						onChange={(weaponIdx, weaponId) =>
							setTeamWeapon("weaponsTeamTwo", weaponIdx, weaponId)
						}
						className="mt-4"
					/>
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

function TeamWeaponSelects({
	label,
	teamSize,
	matchIndex,
	teamNumber,
	weapons,
	quickSelectWeaponsIds,
	onChange,
	className,
}: {
	label: string;
	teamSize: number;
	matchIndex: number;
	teamNumber: 1 | 2;
	weapons: WeaponPoolItem[];
	quickSelectWeaponsIds: MainWeaponId[];
	onChange: (weaponIdx: number, weaponId: MainWeaponId | null) => void;
	className?: string;
}) {
	return (
		<div className={className}>
			<Label required>{label}</Label>
			<div className="stack sm">
				{new Array(teamSize).fill(null).map((_, i) => (
					<WeaponSelect
						key={i}
						isRequired
						testId={`match-${matchIndex}-team${teamNumber}-weapon-${i}`}
						value={(weapons[i]?.id as MainWeaponId) ?? null}
						quickSelectWeaponsIds={quickSelectWeaponsIds}
						onChange={(weaponId) => onChange(i, weaponId)}
					/>
				))}
			</div>
		</div>
	);
}

export function formatTime(seconds: number): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	}

	return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
