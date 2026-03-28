import clsx from "clsx";
import { Check, ClipboardCopy, Copy, SquarePen, Trash } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Image, WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { YouTubeEmbed } from "~/components/YouTubeEmbed";
import { useUser } from "~/features/auth/core/user";
import { useHydrated } from "~/hooks/useHydrated";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags, type SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import type { Unpacked } from "~/utils/types";
import {
	modeImageUrl,
	navIconUrl,
	newVodPage,
	stageImageUrl,
	VODS_PAGE,
	vodVideoPage,
} from "~/utils/urls";
import { SendouButton } from "../../../components/elements/Button";
import { action } from "../actions/vods.$id.server";
import { PovUser } from "../components/VodPov";
import { loader } from "../loaders/vods.$id.server";
import type { Vod } from "../vods-types";
import {
	canEditVideo,
	generateYoutubeTimestamps,
	secondsToHoursMinutesSecondString,
} from "../vods-utils";
import styles from "./vods.$id.module.css";

export { action, loader };

export const handle: SendouRouteHandle = {
	i18n: ["vods"],
	breadcrumb: ({ match }) => {
		const data = match.data as SerializeFrom<typeof loader> | undefined;

		if (!data) return [];

		return [
			{
				imgPath: navIconUrl("vods"),
				href: VODS_PAGE,
				type: "IMAGE",
			},
			{
				text: data.vod.title,
				href: vodVideoPage(data.vod.id),
				type: "TEXT",
			},
		];
	},
};

export const meta: MetaFunction<typeof loader> = (args) => {
	if (!args.data) return [];

	return metaTags({
		title: args.data.vod.title,
		description:
			"Splatoon 3 VoD with timestamps to check out specific weapons as well as map and mode combinations.",
		location: args.location,
	});
};

export default function VodPage() {
	const [start, setStart] = useSearchParamState({
		name: "start",
		defaultValue: 0,
		revive: Number,
	});
	const isHydrated = useHydrated();
	const [autoplay, setAutoplay] = React.useState(false);
	const data = useLoaderData<typeof loader>();
	const { t } = useTranslation(["common", "vods"]);
	const user = useUser();
	const { formatDate } = useTimeFormat();

	return (
		<Main className="stack lg">
			<div className="stack sm">
				<YouTubeEmbed
					key={start}
					id={data.vod.youtubeId}
					start={start}
					autoplay={autoplay}
				/>
				<h2 className="text-sm">{data.vod.title}</h2>
				<div className="stack horizontal justify-between">
					<div className="stack horizontal sm items-center">
						<PovUser pov={data.vod.pov} />
						<time
							className={clsx("text-lighter text-xs", {
								invisible: !isHydrated,
							})}
						>
							{isHydrated
								? formatDate(databaseTimestampToDate(data.vod.youtubeDate), {
										day: "numeric",
										month: "numeric",
										year: "numeric",
									})
								: "t"}
						</time>
					</div>

					{canEditVideo({
						submitterUserId: data.vod.submitterUserId,
						userId: user?.id,
						povUserId:
							typeof data.vod.pov === "string" ? undefined : data.vod.pov?.id,
					}) ? (
						<div className="stack horizontal md">
							{user?.id === data.vod.submitterUserId ? (
								<CopyTimestampsButton
									matches={data.vod.matches}
									type={data.vod.type}
								/>
							) : null}
							<LinkButton
								to={newVodPage(data.vod.id)}
								size="small"
								testId="edit-vod-button"
								icon={<SquarePen />}
							>
								{t("common:actions.edit")}
							</LinkButton>
							<FormWithConfirm
								dialogHeading={t("vods:deleteConfirm", {
									title: data.vod.title,
								})}
							>
								<SendouButton
									variant="minimal-destructive"
									size="small"
									type="submit"
									icon={<Trash />}
								>
									{t("common:actions.delete")}
								</SendouButton>
							</FormWithConfirm>
						</div>
					) : null}
				</div>
			</div>
			<div className={styles.matches}>
				{data.vod.matches.map((match) => (
					<Match
						key={match.id}
						match={match}
						setStart={(newStart) => {
							setStart(newStart);
							setAutoplay(true);
							window.scrollTo(0, 0);
						}}
					/>
				))}
			</div>
		</Main>
	);
}

function Match({
	match,
	setStart,
}: {
	match: Unpacked<Vod["matches"]>;
	setStart: (start: number) => void;
}) {
	const { t } = useTranslation(["game-misc", "weapons"]);

	const weapon = match.weapons.length === 1 ? match.weapons[0] : null;
	const weapons = match.weapons.length > 1 ? match.weapons : null;

	const teamSize = weapons ? weapons.length / 2 : 0;

	return (
		<div className={styles.match}>
			<Image
				alt=""
				path={stageImageUrl(match.stageId)}
				width={120}
				className="rounded"
			/>
			{typeof weapon === "number" ? (
				<WeaponImage
					weaponSplId={weapon}
					variant="badge"
					width={42}
					className={styles.matchWeapon}
					testId={`weapon-img-${weapon}`}
				/>
			) : null}
			<Image
				path={modeImageUrl(match.mode)}
				width={32}
				className={clsx(styles.matchMode, { [styles.cast]: Boolean(weapons) })}
				alt={t(`game-misc:MODE_LONG_${match.mode}`)}
				title={t(`game-misc:MODE_LONG_${match.mode}`)}
			/>
			{weapons ? (
				<div className="stack horizontal md">
					<div className={styles.matchWeapons}>
						{weapons.slice(0, teamSize).map((weapon, i) => {
							return (
								<WeaponImage
									key={i}
									testId={`weapon-img-${weapon}-${i}`}
									weaponSplId={weapon}
									variant="badge"
									width={30}
								/>
							);
						})}
					</div>
					<div className={styles.matchWeapons}>
						{weapons.slice(teamSize).map((weapon, i) => {
							const adjustedI = i + teamSize;
							return (
								<WeaponImage
									key={i}
									testId={`weapon-img-${weapon}-${adjustedI}`}
									weaponSplId={weapon}
									variant="badge"
									width={30}
								/>
							);
						})}
					</div>
				</div>
			) : null}
			<SendouButton
				size="small"
				onPress={() => setStart(match.startsAt)}
				variant="outlined"
			>
				{secondsToHoursMinutesSecondString(match.startsAt)}
			</SendouButton>
		</div>
	);
}

function CopyTimestampsButton({
	matches,
	type,
}: {
	matches: Vod["matches"];
	type: Vod["type"];
}) {
	const { t } = useTranslation(["vods", "weapons", "game-misc", "common"]);
	const [dialogOpen, setDialogOpen] = React.useState(false);
	const [copied, setCopied] = React.useState(false);
	const [copyTrigger, setCopyTrigger] = React.useState(0);
	const [modeFormat, setModeFormat] = React.useState<"short" | "long">("short");
	const [stageFormat, setStageFormat] = React.useState<"short" | "long">(
		"long",
	);

	const timestamps = generateYoutubeTimestamps(matches, type, {
		weaponName: (id) => t(`weapons:MAIN_${id}` as "weapons:MAIN_0"),
		stageName: (id) => {
			const fullName = t(`game-misc:STAGE_${id}` as "game-misc:STAGE_0");
			return stageFormat === "short" ? shortStageName(fullName) : fullName;
		},
		modeName: (mode) =>
			modeFormat === "long"
				? t(`game-misc:MODE_LONG_${mode}` as "game-misc:MODE_LONG_SZ")
				: mode,
	});

	React.useEffect(() => {
		if (copyTrigger === 0) return;

		setCopied(true);
		const timeout = setTimeout(() => setCopied(false), 2000);

		return () => clearTimeout(timeout);
	}, [copyTrigger]);

	const handleCopy = () => {
		navigator.clipboard.writeText(timestamps);
		setCopyTrigger((prev) => prev + 1);
	};

	return (
		<>
			<SendouButton
				size="small"
				variant="outlined"
				icon={<ClipboardCopy />}
				onPress={() => {
					setDialogOpen(true);
					setCopied(false);
				}}
				data-testid="copy-timestamps-button"
			>
				{t("vods:copyTimestamps")}
			</SendouButton>
			<SendouDialog
				isOpen={dialogOpen}
				onClose={() => setDialogOpen(false)}
				heading={t("vods:copyTimestamps")}
			>
				<div className="stack md">
					<div className="stack horizontal md w-full">
						<label className="flex-same-size">
							{t("vods:copyTimestamps.modeFormat")}
							<select
								value={modeFormat}
								onChange={(e) =>
									setModeFormat(e.target.value as "short" | "long")
								}
							>
								<option value="short">
									{t("vods:copyTimestamps.format.short")}
								</option>
								<option value="long">
									{t("vods:copyTimestamps.format.long")}
								</option>
							</select>
						</label>
						<label className="flex-same-size">
							{t("vods:copyTimestamps.stageFormat")}
							<select
								value={stageFormat}
								onChange={(e) =>
									setStageFormat(e.target.value as "short" | "long")
								}
							>
								<option value="short">
									{t("vods:copyTimestamps.format.short")}
								</option>
								<option value="long">
									{t("vods:copyTimestamps.format.long")}
								</option>
							</select>
						</label>
					</div>
					<textarea
						readOnly
						value={timestamps}
						rows={Math.min(matches.length + 2, 15)}
						className="w-full"
					/>
					<p className="text-lighter text-xs">
						{t("vods:copyTimestamps.help")}
					</p>
					<SendouButton
						onPress={handleCopy}
						icon={copied ? <Check /> : <Copy />}
					>
						{copied
							? t("common:actions.copied")
							: t("common:actions.copyToClipboard")}
					</SendouButton>
				</div>
			</SendouDialog>
		</>
	);
}
