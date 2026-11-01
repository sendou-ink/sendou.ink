import clsx from "clsx";
import {
	ArrowLeftRight,
	ChevronDown,
	ChevronsLeft,
	ChevronUp,
	Clapperboard,
	Clock,
	Coffee,
	Flag,
	Gamepad2,
	Hand,
	Link2,
	type LucideIcon,
	Map as MapIcon,
	Mic,
	Pause,
	Play,
	Plus,
	TriangleAlert,
	Trophy,
	Users,
	X,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useRevalidator } from "react-router";
import * as R from "remeda";
import { ActionButton } from "~/components/ActionButton";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouSection } from "~/components/elements/Section";
import { InviteLinkInput } from "~/components/InviteLinkInput";
import { Config } from "~/config";
import { useTournament } from "~/features/tournament/tournament-context";
import { SendouForm } from "~/form/SendouForm";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { useHydrated } from "~/hooks/useHydrated";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { tournamentMatchPage } from "~/utils/urls";
import {
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_DURATIONS_MS,
	BROADCAST_HOLD_SCENES,
	BROADCAST_INK_COLORS,
	BROADCAST_KEYFRAMES,
	BROADCAST_PROTOTYPE_CLIPS,
	BROADCAST_REHEARSE_MESSAGE,
	BROADCAST_SCENE_DEFAULT_DURATIONS_MS,
	BROADCAST_SCENE_PARTS,
	BROADCAST_SCENES,
	BROADCAST_THEME_TOKENS,
	BROADCAST_TRANSITIONS,
} from "../broadcast-constants";
import { useBroadcastStream, useClipSender } from "../broadcast-hooks";
import {
	broadcastActionSchema,
	broadcastInfoFormSchema,
	broadcastThemeFormSchema,
} from "../broadcast-schemas";
import type {
	BroadcastMatch,
	BroadcastScene,
	BroadcastState,
	BroadcastView,
	ProducerState,
} from "../broadcast-types";
import {
	broadcastOverlayPage,
	broadcastSignalUrl,
	broadcastStreamUrl,
} from "../broadcast-urls";
import {
	gameInk,
	inkColorVars,
	matchSides,
	roundLabel,
} from "../broadcast-utils";
import { BroadcastPreview } from "../components/BroadcastPreview";
import * as BracketFocus from "../core/BracketFocus";
import type * as ClipTransfer from "../core/ClipTransfer";
import * as Producer from "../core/Producer";
import { loader } from "../loaders/to.$id.broadcast.$channel.server";
import styles from "./to.$id.broadcast.$channel.module.css";

export { action } from "../actions/to.$id.broadcast.$channel.server";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["broadcast"],
};

// the staged item is highlighted for this long before it goes on air by itself
const AUTO_TAKE_IMMINENT_MS = 5_000;

const SCENE_ICONS: Record<BroadcastScene, LucideIcon> = {
	starting: Clock,
	casters: Mic,
	rosters: Users,
	maps: MapIcon,
	game: Gamepad2,
	break: Coffee,
	replays: Clapperboard,
	bracket: Trophy,
	technical: TriangleAlert,
	ending: Flag,
};

/** Control panel of one broadcast: the live and the staged ("next") overlay side by side, Take puts next on air. */
export default function BroadcastDashboardPage() {
	const { t } = useTranslation(["broadcast"]);
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();
	const pageArgs = { tournamentId: tournament.ctx.id, slug: data.channel.slug };
	const clipSender = useClipSender({
		signalUrl: broadcastSignalUrl(pageArgs),
		clips: BROADCAST_PROTOTYPE_CLIPS,
	});
	const { state, isConnected, clockOffsetMs } = useBroadcastStream({
		url: broadcastStreamUrl({ ...pageArgs, role: "dashboard" }),
		initialState: data.state,
		onMessage: clipSender.onMessage,
	});
	const nextPreviewRef = React.useRef<HTMLIFrameElement>(null);
	useRevalidateOnFeaturedMatchChange(state.match?.id ?? null);
	const now = useServerNow(clockOffsetMs);
	const [selectedItemId, setSelectedItemId] = React.useState<number | null>(
		null,
	);
	const staged = Producer.stagedItems(state);
	// an item gone on air leaves the staged one selected
	const selected =
		staged.find((item) => item.id === selectedItemId) ?? state.next;
	const selectedPosition = staged.indexOf(selected);
	const selectedLabel =
		selectedPosition === 0
			? t("broadcast:dashboard.item.next")
			: t("broadcast:dashboard.item.queued", {
					position: selectedPosition + 1,
				});
	// the take column is narrow
	const selectedShortLabel =
		selectedPosition === 0
			? t("broadcast:dashboard.item.next")
			: t("broadcast:dashboard.item.queuedShort", {
					position: selectedPosition + 1,
				});
	const autoTakeAt = Producer.autoTakeAt(state);
	const isAutoTakeImminent =
		autoTakeAt !== null &&
		now !== null &&
		autoTakeAt - now <= AUTO_TAKE_IMMINENT_MS;

	const rehearse = () =>
		nextPreviewRef.current?.contentWindow?.postMessage(
			BROADCAST_REHEARSE_MESSAGE,
			window.location.origin,
		);

	return (
		<div className={clsx("stack lg", styles.dashboard)}>
			<header className="stack sm">
				<div className="stack horizontal sm items-center justify-between flex-wrap">
					<h1 className="text-lg">
						{t("broadcast:title")} · {data.channel.name}
					</h1>
					<Health state={state} isConnected={isConnected} />
				</div>
				<FeaturedMatch state={state} />
				<ResultsNotOnAir state={state} />
			</header>

			<div className={styles.switcher}>
				<section className={clsx(styles.switcherView, styles.liveView)}>
					<ViewHeader view="live" state={state} />
					<BroadcastPreview
						src={broadcastOverlayPage({
							...pageArgs,
							view: "live",
							preview: true,
						})}
						title={t("broadcast:dashboard.live")}
					/>
					<LiveTimer state={state} now={now} />
				</section>

				<div className={styles.takeColumn}>
					<ActionButton
						schema={broadcastActionSchema}
						action="TAKE"
						fields={{
							takeId: state.takeId,
							matchId: state.match?.id,
							resultCount: state.match?.progress.next.resultCount,
						}}
						size="big"
						icon={<ChevronsLeft />}
						className={styles.take}
						formClassName={styles.takeForm}
						testId="broadcast-take-button"
					>
						{t("broadcast:dashboard.take")}
					</ActionButton>
					<AutoTake
						state={state}
						remainingMs={
							autoTakeAt !== null && now !== null ? autoTakeAt - now : null
						}
					/>
					<TransitionBus
						selected={selected}
						selectedLabel={selectedShortLabel}
						onRehearse={rehearse}
					/>
				</div>

				<section className={clsx(styles.switcherView, styles.nextView)}>
					<ViewHeader
						view="next"
						state={state}
						isImminent={isAutoTakeImminent}
					/>
					<BroadcastPreview
						iframeRef={nextPreviewRef}
						src={broadcastOverlayPage({
							...pageArgs,
							view: "next",
							preview: true,
						})}
						title={t("broadcast:dashboard.next")}
					/>
					<Queue
						state={state}
						selected={selected}
						onSelect={setSelectedItemId}
						areClipsOnSources={everySourceHasClips(clipSender.statuses)}
					/>
				</section>
			</div>

			<SceneTiles
				state={state}
				selected={selected}
				selectedLabel={selectedLabel}
			/>

			<ReplayClips
				selected={selected}
				selectedLabel={selectedLabel}
				statuses={clipSender.statuses}
			/>

			<BracketControls selected={selected} selectedLabel={selectedLabel} />

			<Teams state={state} selected={selected} selectedLabel={selectedLabel} />

			<SendouSection title={t("broadcast:dashboard.setup.header")}>
				<div className="stack md">
					<p className="text-sm text-lighter">
						{t("broadcast:dashboard.setup.program")}
					</p>
					<InviteLinkInput
						label={t("broadcast:dashboard.setup.programLabel")}
						link={`${Config.siteDomain}${broadcastOverlayPage(pageArgs)}`}
					/>
				</div>
			</SendouSection>

			<SendouSection title={t("broadcast:dashboard.info.header")}>
				<SendouForm
					schema={broadcastInfoFormSchema}
					defaultValues={{
						headline: state.settings.headline || null,
						casterIds: state.settings.casterIds,
					}}
				>
					{({ FormField }) => (
						<>
							<FormField name="headline" />
							<FormField name="casterIds" />
						</>
					)}
				</SendouForm>
			</SendouSection>

			<SendouSection title={t("broadcast:dashboard.theme.header")}>
				<div className="stack md">
					<SendouForm
						schema={broadcastThemeFormSchema}
						defaultValues={{
							weaponImages: state.settings.weaponImages,
							css: state.settings.css || null,
						}}
					>
						{({ FormField }) => (
							<>
								<FormField name="weaponImages" />
								<FormField name="css" />
							</>
						)}
					</SendouForm>
					<ThemeReference />
				</div>
			</SendouSection>
		</div>
	);
}

/** The chat of the featured match comes from the loader, so it reloads as another match gets featured. */
function useRevalidateOnFeaturedMatchChange(featuredMatchId: number | null) {
	const data = useLoaderData<typeof loader>();
	const { revalidate } = useRevalidator();
	const isStale = featuredMatchId !== data.featuredMatchId;

	React.useEffect(() => {
		if (isStale) revalidate();
	}, [isStale, revalidate]);
}

function Health({
	state,
	isConnected,
}: {
	state: BroadcastState;
	isConnected: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);

	if (!isConnected) {
		return (
			<Alert variation="WARNING" tiny alertClassName={styles.health}>
				{t("broadcast:dashboard.health.disconnected")}
			</Alert>
		);
	}

	return (
		<Alert
			variation={state.health.sources > 0 ? "SUCCESS" : "INFO"}
			tiny
			alertClassName={styles.health}
		>
			{t("broadcast:dashboard.health.sources", {
				count: state.health.sources,
			})}
		</Alert>
	);
}

function FeaturedMatch({ state }: { state: BroadcastState }) {
	const { t } = useTranslation(["broadcast", "tournament"]);
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	if (!state.match) {
		return (
			<Alert variation="WARNING" alertClassName={styles.health}>
				{t("broadcast:dashboard.noFeaturedMatch")}
			</Alert>
		);
	}

	const [teamOne, teamTwo] = state.match.teams;
	const progress = state.match.progress.next;
	const joinInfo =
		data.featuredMatchId === state.match.id ? data.joinInfo : null;

	return (
		<div className="text-sm">
			<span className="text-lighter">
				{t("broadcast:dashboard.featuredMatch")}:
			</span>{" "}
			<Link
				to={tournamentMatchPage({
					tournamentId: tournament.ctx.id,
					matchId: state.match.id,
				})}
				className="font-semi-bold"
			>
				{teamOne?.name ?? t("broadcast:overlay.tbd")} {progress.scores[0]}–
				{progress.scores[1]} {teamTwo?.name ?? t("broadcast:overlay.tbd")}
			</Link>{" "}
			<span className="text-lighter">{roundLabel(state.match)}</span>
			{progress.isOver ? (
				<span className="text-warning">
					{" "}
					· {t("broadcast:dashboard.setFinished")}
				</span>
			) : joinInfo ? (
				<span>
					{" "}
					<span className="text-lighter">· {t("tournament:match.pool")}</span>{" "}
					<span className="font-semi-bold">{joinInfo.pool}</span>{" "}
					<span className="text-lighter">{t("tournament:match.pass")}</span>{" "}
					<span className="font-semi-bold">{joinInfo.pass}</span>
				</span>
			) : null}
		</div>
	);
}

function TransitionBus({
	selected,
	selectedLabel,
	onRehearse,
}: {
	selected: ProducerState;
	selectedLabel: string;
	onRehearse: () => void;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);

	return (
		<div className={styles.transitionBus}>
			<div className={styles.busLabel}>
				{t("broadcast:dashboard.transition", { item: selectedLabel })}
			</div>
			<SendouChipRadioGroup
				orientation="vertical"
				className={styles.transitions}
				aria-label={t("broadcast:dashboard.transition", {
					item: selectedLabel,
				})}
			>
				{BROADCAST_TRANSITIONS.map((transition) => (
					<SendouChipRadio
						key={transition}
						name="broadcast-transition"
						value={transition}
						checked={selected.transition === transition}
						onChange={() =>
							submit("SET_TRANSITION", { itemId: selected.id, transition })
						}
					>
						{t(`broadcast:transition.${transition}`)}
					</SendouChipRadio>
				))}
			</SendouChipRadioGroup>
			<SendouButton
				size="small"
				variant="minimal"
				icon={<Play />}
				onClick={onRehearse}
				title={t("broadcast:dashboard.rehearseHint")}
				testId="broadcast-rehearse-button"
			>
				{t("broadcast:dashboard.rehearse")}
			</SendouButton>
		</div>
	);
}

function SceneTiles({
	state,
	selected,
	selectedLabel,
}: {
	state: BroadcastState;
	selected: ProducerState;
	selectedLabel: string;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	const defaultDurationMs =
		BROADCAST_SCENE_DEFAULT_DURATIONS_MS[selected.scene];

	return (
		<div className="stack sm">
			<h2 className={styles.sectionLabel}>
				{t("broadcast:dashboard.scene", { item: selectedLabel })}
			</h2>
			<div className={styles.scenes}>
				{BROADCAST_SCENES.map((scene) => {
					const Icon = SCENE_ICONS[scene];

					return (
						<ActionButton
							key={scene}
							schema={broadcastActionSchema}
							action="SET_SCENE"
							fields={{ itemId: selected.id, scene }}
							className={clsx(styles.sceneTile, {
								[styles.sceneTileNext]: selected.scene === scene,
							})}
							formClassName={styles.sceneForm}
							testId={`broadcast-scene-${scene}`}
						>
							{state.live.scene === scene ? (
								<span className={styles.liveBadge}>
									{t("broadcast:dashboard.live")}
								</span>
							) : null}
							<Icon className={styles.sceneIcon} />
							{t(`broadcast:scene.${scene}`)}
						</ActionButton>
					);
				})}
			</div>
			{defaultDurationMs !== undefined ? (
				<div className="stack horizontal sm items-center flex-wrap">
					<span className="text-sm font-semi-bold">
						{t("broadcast:dashboard.duration.label")}
					</span>
					<SendouChipRadioGroup
						aria-label={t("broadcast:dashboard.duration.label")}
						wrap
					>
						<SendouChipRadio
							name="broadcast-duration"
							value="untilTake"
							checked={selected.durationMs === null}
							onChange={() => submit("SET_DURATION", { itemId: selected.id })}
						>
							{t("broadcast:dashboard.duration.untilTake")}
						</SendouChipRadio>
						{BROADCAST_DURATIONS_MS.map((durationMs) => (
							<SendouChipRadio
								key={durationMs}
								name="broadcast-duration"
								value={String(durationMs)}
								checked={selected.durationMs === durationMs}
								onChange={() =>
									submit("SET_DURATION", { itemId: selected.id, durationMs })
								}
							>
								{formatClock(durationMs)}
							</SendouChipRadio>
						))}
					</SendouChipRadioGroup>
				</div>
			) : null}
		</div>
	);
}

function ReplayClips({
	selected,
	selectedLabel,
	statuses,
}: {
	selected: ProducerState;
	selectedLabel: string;
	statuses: ClipTransfer.ClipPeerStatus[];
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	const header = t("broadcast:dashboard.clips.header", { item: selectedLabel });

	return (
		<SendouSection title={header}>
			<div className="stack md">
				<div className="text-xs text-lighter">
					{t("broadcast:dashboard.clips.explanation")}
				</div>
				<SendouChipRadioGroup aria-label={header} wrap>
					<SendouChipRadio
						name="broadcast-clip"
						value="none"
						checked={selected.clipId === null}
						onChange={() => submit("SET_CLIP", { itemId: selected.id })}
					>
						{t("broadcast:dashboard.clips.none")}
					</SendouChipRadio>
					{BROADCAST_PROTOTYPE_CLIPS.map((clip) => (
						<SendouChipRadio
							key={clip.id}
							name="broadcast-clip"
							value={clip.id}
							checked={selected.clipId === clip.id}
							onChange={() =>
								submit("SET_CLIP", { itemId: selected.id, clipId: clip.id })
							}
						>
							{clip.name} · {formatClock(clip.durationMs)}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
				<div className="stack xs text-sm">
					<span className="font-semi-bold">
						{t("broadcast:dashboard.clips.overlays")}
					</span>
					{statuses.length === 0 ? (
						<span className="text-lighter">
							{t("broadcast:dashboard.clips.noOverlays")}
						</span>
					) : (
						statuses.map((status) => (
							<span key={status.peer.id}>
								{t(`broadcast:dashboard.clips.role.${status.peer.role}`)} ·{" "}
								<span className="text-lighter">{status.connectionState}</span>
								{status.missingCount !== null ? (
									<>
										{" "}
										·{" "}
										{status.missingCount === 0
											? t("broadcast:dashboard.clips.upToDate")
											: status.transferMs !== null
												? t("broadcast:dashboard.clips.transferred", {
														count: status.missingCount,
														seconds: (status.transferMs / 1000).toFixed(1),
													})
												: t("broadcast:dashboard.clips.progress", {
														received: status.receivedCount,
														total: status.missingCount,
													})}
									</>
								) : null}
							</span>
						))
					)}
				</div>
			</div>
		</SendouSection>
	);
}

function BracketControls({
	selected,
	selectedLabel,
}: {
	selected: ProducerState;
	selectedLabel: string;
}) {
	const { t } = useTranslation(["broadcast"]);
	const tournament = useTournament();
	const { submit } = useActionSubmit(broadcastActionSchema);
	const showableIdxs = BracketFocus.showableBracketIdxs(tournament);

	if (showableIdxs.length === 0) return null;

	return (
		<SendouSection
			title={t("broadcast:dashboard.bracket.header", { item: selectedLabel })}
		>
			<div className="stack md">
				<div className="text-xs text-lighter">
					{t("broadcast:dashboard.bracket.explanation")}
				</div>
				<SendouChipRadioGroup
					aria-label={t("broadcast:dashboard.bracket.focus")}
					wrap
				>
					{BROADCAST_BRACKET_FOCUSES.map((focus) => (
						<SendouChipRadio
							key={focus}
							name="broadcast-bracket-focus"
							value={focus}
							checked={selected.bracketFocus === focus}
							onChange={() =>
								submit("SET_BRACKET_FOCUS", { itemId: selected.id, focus })
							}
						>
							{t(`broadcast:bracketFocus.${focus}`)}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
				{showableIdxs.length > 1 ? (
					<SendouChipRadioGroup
						aria-label={t("broadcast:dashboard.bracket.bracket")}
						wrap
					>
						<SendouChipRadio
							name="broadcast-bracket"
							value="featured"
							checked={selected.bracketIdx === null}
							onChange={() => submit("SET_BRACKET", { itemId: selected.id })}
						>
							{t("broadcast:dashboard.bracket.followFeatured")}
						</SendouChipRadio>
						{showableIdxs.map((bracketIdx) => (
							<SendouChipRadio
								key={bracketIdx}
								name="broadcast-bracket"
								value={String(bracketIdx)}
								checked={selected.bracketIdx === bracketIdx}
								onChange={() =>
									submit("SET_BRACKET", { itemId: selected.id, bracketIdx })
								}
							>
								{tournament.bracketsMeta[bracketIdx].name}
							</SendouChipRadio>
						))}
					</SendouChipRadioGroup>
				) : null}
			</div>
		</SendouSection>
	);
}

function Teams({
	state,
	selected,
	selectedLabel,
}: {
	state: BroadcastState;
	selected: ProducerState;
	selectedLabel: string;
}) {
	const { t } = useTranslation(["broadcast"]);

	if (!state.match) return null;

	return (
		<SendouSection title={t("broadcast:dashboard.teams.header")}>
			<div className="stack md">
				<ActionButton
					schema={broadcastActionSchema}
					action="SET_SWAP_SIDES"
					fields={{ itemId: selected.id, swapSides: !selected.swapSides }}
					variant={selected.swapSides ? "primary" : "outlined"}
					size="small"
					icon={<ArrowLeftRight />}
					formClassName="self-start"
				>
					{t("broadcast:dashboard.swapSides", { item: selectedLabel })}
				</ActionButton>
				<InkColors state={state} match={state.match} />
			</div>
		</SendouSection>
	);
}

function InkColors({
	state,
	match,
}: {
	state: BroadcastState;
	match: BroadcastMatch;
}) {
	const { t } = useTranslation(["broadcast"]);
	const ink = gameInk(state, "live");
	const colors = inkColorVars({ ink, swapSides: state.live.swapSides });
	const sides = matchSides(match, "live", state.live);
	const gameOnAir = {
		matchId: match.id,
		resultCount: match.progress.live.resultCount,
	};

	return (
		<div className="stack sm">
			<div className="stack horizontal sm items-center justify-between flex-wrap">
				<span className="text-sm font-semi-bold">
					{t("broadcast:dashboard.ink.header")}
				</span>
				<div className="stack horizontal sm">
					<ActionButton
						schema={broadcastActionSchema}
						action="SET_INK"
						fields={{ isFlipped: false, ...gameOnAir }}
						variant={ink ? "minimal" : "primary"}
						size="small"
					>
						{t("broadcast:dashboard.ink.theme")}
					</ActionButton>
					{ink ? (
						<ActionButton
							schema={broadcastActionSchema}
							action="SET_INK"
							fields={{ key: ink.key, isFlipped: !ink.isFlipped, ...gameOnAir }}
							variant="outlined"
							size="small"
							icon={<ArrowLeftRight />}
							testId="broadcast-ink-flip"
						>
							{t("broadcast:dashboard.ink.flip")}
						</ActionButton>
					) : null}
				</div>
			</div>
			<div className="text-xs text-lighter">
				{t("broadcast:dashboard.ink.explanation")}
			</div>
			<div className={styles.inkSwatches}>
				{BROADCAST_INK_COLORS.map((color) => (
					<ActionButton
						key={color.key}
						schema={broadcastActionSchema}
						action="SET_INK"
						fields={{
							key: color.key,
							isFlipped: ink?.isFlipped ?? false,
							...gameOnAir,
						}}
						variant="minimal"
						className={clsx(styles.inkSwatch, {
							[styles.inkSwatchSelected]: ink?.key === color.key,
						})}
						formClassName={styles.inkSwatchForm}
						title={t(`broadcast:ink.${color.key}`)}
						aria-label={t(`broadcast:ink.${color.key}`)}
						testId={`broadcast-ink-${color.key}`}
					>
						<span style={{ background: color.a }} />
						<span style={{ background: color.b }} />
					</ActionButton>
				))}
			</div>
			{ink ? (
				<div className="stack horizontal md text-sm flex-wrap">
					{sides.map((side) => (
						<span key={side.side} className={styles.inkTeam}>
							<span
								className={styles.inkDot}
								style={{ background: colors[`--bc-team-${side.side}`] }}
							/>
							{side.team?.name ?? t("broadcast:overlay.tbd")}
						</span>
					))}
				</div>
			) : null}
		</div>
	);
}

function ResultsNotOnAir({ state }: { state: BroadcastState }) {
	const { t } = useTranslation(["broadcast"]);

	if (!state.match) return null;

	const { live, next } = state.match.progress;
	const notOnAirCount = next.resultCount - live.resultCount;
	if (notOnAirCount <= 0) return null;

	return (
		<div className="stack horizontal sm items-center flex-wrap">
			<Alert variation="INFO" tiny alertClassName={styles.health}>
				{t("broadcast:dashboard.resultsNotOnAir", {
					count: notOnAirCount,
					live: live.scores.join("–"),
					next: next.scores.join("–"),
				})}
			</Alert>
			<ActionButton
				schema={broadcastActionSchema}
				action="SHOW_RESULTS"
				fields={{ matchId: state.match.id, resultCount: next.resultCount }}
				size="small"
				variant="outlined"
				testId="broadcast-show-results-button"
			>
				{t("broadcast:dashboard.showResults")}
			</ActionButton>
		</div>
	);
}

function ViewHeader({
	view,
	state,
	isImminent = false,
}: {
	view: BroadcastView;
	state: BroadcastState;
	/** Going on air by itself in a moment. */
	isImminent?: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<h2
			className={styles.viewHeader}
			data-view={view}
			data-imminent={isImminent || undefined}
		>
			{t(`broadcast:dashboard.${view}`)} ·{" "}
			{t(`broadcast:scene.${state[view].scene}`)}
		</h2>
	);
}

function LiveTimer({
	state,
	now,
}: {
	state: BroadcastState;
	now: number | null;
}) {
	const { t } = useTranslation(["broadcast"]);
	const startedAt = Producer.liveStartedAt(state);
	const endsAt = Producer.liveEndsAt(state);

	if (startedAt === null || endsAt === null || now === null) return null;

	const progress = R.clamp((now - startedAt) / (endsAt - startedAt), {
		min: 0,
		max: 1,
	});

	return (
		<div className={styles.liveTimer}>
			<div className={styles.liveTimerTrack}>
				<div
					className={styles.liveTimerBar}
					style={{ width: `${progress * 100}%` }}
				/>
			</div>
			<span className="text-xs text-lighter">
				{t("broadcast:dashboard.timeLeft", {
					time: formatClock(endsAt - now),
				})}
			</span>
		</div>
	);
}

function AutoTake({
	state,
	remainingMs,
}: {
	state: BroadcastState;
	/** `null` when next waits for a Take. */
	remainingMs: number | null;
}) {
	const { t } = useTranslation(["broadcast"]);

	if (remainingMs === null) return <div className={styles.autoTake} />;

	return (
		<div className={styles.autoTake}>
			<span className={styles.autoTakeCountdown}>
				{t("broadcast:dashboard.autoIn", { time: formatClock(remainingMs) })}
			</span>
			<ActionButton
				schema={broadcastActionSchema}
				action="SET_AUTO"
				fields={{ itemId: state.next.id, isAuto: false }}
				size="small"
				variant="outlined-destructive"
				icon={<Pause />}
				title={t("broadcast:dashboard.holdHint")}
				testId="broadcast-hold-button"
			>
				{t("broadcast:dashboard.hold")}
			</ActionButton>
		</div>
	);
}

/** The staged items in the order they go on air, the one picked being edited by the controls. */
function Queue({
	state,
	selected,
	onSelect,
	areClipsOnSources,
}: {
	state: BroadcastState;
	selected: ProducerState;
	onSelect: (itemId: number) => void;
	areClipsOnSources: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	const staged = Producer.stagedItems(state);

	return (
		<div className="stack sm">
			<ol
				className={styles.queue}
				aria-label={t("broadcast:dashboard.queue.header")}
			>
				{staged.map((item, idx) => {
					const Icon = SCENE_ICONS[item.scene];
					const isSelected = item.id === selected.id;
					const isClipMissing =
						item.scene === "replays" &&
						item.clipId !== null &&
						!areClipsOnSources;

					return (
						<li key={item.id} className="stack xs">
							<QueueGap
								before={idx === 0 ? state.live : staged[idx - 1]}
								item={item}
							/>
							<div
								className={styles.queueItem}
								data-selected={isSelected || undefined}
							>
								<button
									type="button"
									className={styles.queueSelect}
									aria-pressed={isSelected}
									onClick={() => onSelect(item.id)}
									data-testid={`broadcast-queue-item-${idx}`}
								>
									<span className={styles.queuePosition}>
										{idx === 0 ? t("broadcast:dashboard.next") : idx + 1}
									</span>
									<Icon size={16} className={styles.queueIcon} />
									<span>{t(`broadcast:scene.${item.scene}`)}</span>
									<span className="text-xs text-lighter">
										{itemDetail(item)}
									</span>
									{isClipMissing ? (
										<span
											role="img"
											className={styles.queueWarning}
											title={t("broadcast:dashboard.queue.clipMissing")}
											aria-label={t("broadcast:dashboard.queue.clipMissing")}
										>
											<TriangleAlert size={14} />
										</span>
									) : null}
								</button>
								<ActionButton
									schema={broadcastActionSchema}
									action="MOVE_IN_QUEUE"
									fields={{ itemId: item.id, direction: "earlier" }}
									variant="minimal"
									size="miniscule"
									shape="square"
									icon={<ChevronUp />}
									isDisabled={idx === 0}
									aria-label={t("broadcast:dashboard.queue.moveEarlier")}
								/>
								<ActionButton
									schema={broadcastActionSchema}
									action="MOVE_IN_QUEUE"
									fields={{ itemId: item.id, direction: "later" }}
									variant="minimal"
									size="miniscule"
									shape="square"
									icon={<ChevronDown />}
									isDisabled={idx === staged.length - 1}
									aria-label={t("broadcast:dashboard.queue.moveLater")}
								/>
								<ActionButton
									schema={broadcastActionSchema}
									action="REMOVE_FROM_QUEUE"
									fields={{ itemId: item.id }}
									variant="minimal-destructive"
									size="miniscule"
									shape="square"
									icon={<X />}
									isDisabled={staged.length === 1}
									aria-label={t("broadcast:dashboard.queue.remove")}
									testId={`broadcast-queue-remove-${idx}`}
								/>
							</div>
						</li>
					);
				})}
			</ol>
			<SendouButton
				size="small"
				variant="outlined"
				icon={<Plus />}
				className="self-start"
				onClick={() => {
					submit("ADD_TO_QUEUE");
					// the item queued gets the id after the last one given
					onSelect(state.lastItemId + 1);
				}}
				testId="broadcast-queue-add"
			>
				{t("broadcast:dashboard.queue.add")}
			</SendouButton>
		</div>
	);
}

/** Whether the item goes on air by itself once the one before it ends, toggled when that one has a length. */
function QueueGap({
	before,
	item,
}: {
	before: ProducerState;
	item: ProducerState;
}) {
	const { t } = useTranslation(["broadcast"]);

	if (Producer.lengthMs(before) === null) {
		return (
			<span className={styles.queueGap}>
				<Hand size={14} />
				{t("broadcast:dashboard.queue.onTake")}
			</span>
		);
	}

	return (
		<ActionButton
			schema={broadcastActionSchema}
			action="SET_AUTO"
			fields={{ itemId: item.id, isAuto: !item.isAuto }}
			variant="minimal"
			size="miniscule"
			icon={item.isAuto ? <Link2 /> : <Hand />}
			className={clsx(styles.queueGapToggle, {
				[styles.queueGapAuto]: item.isAuto,
			})}
			formClassName={styles.queueGap}
			title={t(
				item.isAuto
					? "broadcast:dashboard.queue.autoHint"
					: "broadcast:dashboard.queue.onTakeHint",
			)}
		>
			{item.isAuto
				? t("broadcast:dashboard.queue.auto")
				: t("broadcast:dashboard.queue.onTake")}
		</ActionButton>
	);
}

function ThemeReference() {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className="stack sm text-sm">
			<div>
				<span className="font-semi-bold">
					{t("broadcast:dashboard.theme.tokens")}:
				</span>{" "}
				<code>{BROADCAST_THEME_TOKENS.join(", ")}</code>
			</div>
			<div>
				<span className="font-semi-bold">
					{t("broadcast:dashboard.theme.keyframes")}:
				</span>{" "}
				<code>
					{BROADCAST_KEYFRAMES.map(
						(keyframes) =>
							`${keyframes} (--bc-anim-${keyframes.replace("bc-", "")})`,
					).join(", ")}
				</code>
			</div>
			{R.keys(BROADCAST_SCENE_PARTS).map((design) => (
				<div key={design}>
					<span className="font-semi-bold">
						{t("broadcast:dashboard.theme.parts")} (
						<code>{designSelector(design)}</code>):
					</span>{" "}
					<code>{BROADCAST_SCENE_PARTS[design].join(", ")}</code>
				</div>
			))}
		</div>
	);
}

function designSelector(design: keyof typeof BROADCAST_SCENE_PARTS) {
	if (design === "stinger" || design === "matchup") {
		return `[data-part="${design}"]`;
	}
	if (design === "hold") {
		return BROADCAST_HOLD_SCENES.map((scene) => `[data-scene="${scene}"]`).join(
			", ",
		);
	}

	return `[data-scene="${design}"]`;
}

/** The server's clock (epoch ms) ticking every second, `null` until hydrated as the server rendered another time. */
function useServerNow(clockOffsetMs: number) {
	const tick = useAutoRerender("second");
	const isHydrated = useHydrated();

	return isHydrated ? tick.getTime() + clockOffsetMs : null;
}

/** Whether every OBS source has every clip, one going on air without it shows the OBS footage instead. */
function everySourceHasClips(statuses: ClipTransfer.ClipPeerStatus[]) {
	return statuses
		.filter((status) => status.peer.role === "source")
		.every((status) => status.missingCount === 0 || status.transferMs !== null);
}

/** Clip and length of a staged item, e.g. "4 splats · 0:25". */
function itemDetail(item: ProducerState) {
	const clip = BROADCAST_PROTOTYPE_CLIPS.find(
		(prototypeClip) =>
			item.scene === "replays" && prototypeClip.id === item.clipId,
	);
	const length = Producer.lengthMs(item);

	return [clip?.name, length !== null ? formatClock(length) : null]
		.filter(Boolean)
		.join(" · ");
}

/** E.g. 0:15 for 15 seconds, rounded up to the second. */
function formatClock(ms: number) {
	const seconds = Math.max(0, Math.ceil(ms / 1000));

	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
