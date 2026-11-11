import clsx from "clsx";
import {
	ArrowLeftRight,
	Brush,
	Cable,
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	CircleCheck,
	CircleDashed,
	Hand,
	Link2,
	type LucideIcon,
	Palette,
	Pause,
	Play,
	Plus,
	ScanEye,
	TriangleAlert,
	Unlink,
	X,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useRevalidator } from "react-router";
import * as R from "remeda";
import { ActionButton } from "~/components/ActionButton";
import { Alert } from "~/components/Alert";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { InfoPopover } from "~/components/InfoPopover";
import { InviteLinkInput } from "~/components/InviteLinkInput";
import { Config } from "~/config";
import {
	BROADCAST_ADVANCES,
	BROADCAST_INK_COLORS,
	BROADCAST_REHEARSE_MESSAGE,
	BROADCAST_TRANSITIONS,
} from "~/features/broadcast/broadcast-constants";
import {
	useBroadcastStream,
	useClipSender,
	useServerNow,
} from "~/features/broadcast/broadcast-hooks";
import { broadcastThemeFormSchema } from "~/features/broadcast/broadcast-schemas";
import type {
	BroadcastAdvance,
	BroadcastMatch,
	BroadcastView,
} from "~/features/broadcast/broadcast-types";
import {
	broadcastDesignPage,
	broadcastOverlayPage,
	broadcastSignalUrl,
	broadcastStreamUrl,
} from "~/features/broadcast/broadcast-urls";
import {
	formatClock,
	gameInk,
	inkColorVars,
	matchSides,
	roundLabel,
} from "~/features/broadcast/broadcast-utils";
import { BroadcastPreview } from "~/features/broadcast/components/BroadcastPreview";
import type * as ClipTransfer from "~/features/broadcast/core/ClipTransfer";
import * as Producer from "~/features/broadcast/core/Producer";
import {
	linkBroadcast,
	useLinkedBroadcast,
} from "~/features/scanner/scanner-activity";
import { useTournament } from "~/features/tournament/tournament-context";
import { SendouForm } from "~/form/SendouForm";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useSearchParam } from "~/modules/search-params/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { tournamentMatchPage } from "~/utils/urls";
import {
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_DASHBOARD_TABS,
	BROADCAST_PROTOTYPE_CLIPS,
	BROADCAST_SCENE_DURATIONS_MS,
	CAST_PRODUCER_RULES,
} from "../broadcast-cast-constants";
import {
	broadcastActionSchema,
	broadcastCastersFormSchema,
	broadcastHeadlineFormSchema,
} from "../broadcast-cast-schemas";
import { broadcastDashboardSearchParams } from "../broadcast-cast-search-params";
import type {
	CastBroadcastState,
	CastProducerState,
	CastScene,
} from "../broadcast-cast-types";
import { needsFeaturedMatch } from "../broadcast-cast-utils";
import {
	SCENE_ICONS,
	ScenePicker,
	useSceneHotkeys,
} from "../components/ScenePicker";
import * as BracketFocus from "../core/BracketFocus";
import { loader } from "../loaders/to.$id.broadcast.$channel.server";
import styles from "./to.$id.broadcast.$channel.module.css";

export { action } from "../actions/to.$id.broadcast.$channel.server";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["broadcast", "q"],
	scannerBroadcast: (match) => ({
		tournamentId: Number(match.params.id),
		slug: match.params.channel!,
	}),
};

// the staged item is highlighted for this long before it goes on air by itself
const AUTO_TAKE_IMMINENT_MS = 5_000;

type DashboardTab = (typeof BROADCAST_DASHBOARD_TABS)[number];

const TAB_ICONS: Record<DashboardTab, LucideIcon> = {
	setup: Cable,
	theme: Palette,
};

/**
 * Control panel of one broadcast: the live and the staged ("next") overlay side by side, Take puts next on air.
 * Left of Take is what is on air, right of it what goes on air next: the queue and the selected item's scene.
 * Under them the show settings set up OBS and the scanner, and theme the overlays.
 */
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
	const settingsRef = React.useRef<HTMLDivElement>(null);
	useRevalidateOnFeaturedMatchChange(state.match?.id ?? null);
	const now = useServerNow(clockOffsetMs);
	const [tab, setTab] = useSearchParam(broadcastDashboardSearchParams, "tab");
	const [selectedItemId, setSelectedItemId] = React.useState<number | null>(
		null,
	);
	const staged = Producer.stagedItems(state);
	// an item gone on air leaves the staged one selected
	const selected =
		staged.find((item) => item.id === selectedItemId) ?? state.next;
	const hasMatch = state.match !== null;
	const canTake = Producer.canTake(CAST_PRODUCER_RULES, state, { hasMatch });
	const autoTakeAt = Producer.autoTakeAt(CAST_PRODUCER_RULES, state, {
		hasMatch,
	});
	const isAutoTakeImminent =
		autoTakeAt !== null &&
		now !== null &&
		autoTakeAt - now <= AUTO_TAKE_IMMINENT_MS;
	const areClipsOnSources = everySourceHasClips(clipSender.statuses);
	const { submit: submitScene } = useActionSubmit(broadcastActionSchema);
	useSceneHotkeys({
		selected: selected.scene,
		isDisabled: (scene) => isSceneMissingMatch(state, scene),
		onSelect: (scene) =>
			submitScene("SET_SCENE", { itemId: selected.id, scene }),
	});

	const rehearse = () =>
		nextPreviewRef.current?.contentWindow?.postMessage(
			BROADCAST_REHEARSE_MESSAGE,
			window.location.origin,
		);

	const showSetup = () => {
		setTab("setup");
		settingsRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	return (
		<div className={clsx("stack lg", styles.dashboard)}>
			<header className="stack sm">
				<div className="stack horizontal sm items-center justify-between flex-wrap">
					<h1 className="text-lg">
						{t("broadcast:title")} · {data.channel.name}
					</h1>
					<div className="stack horizontal sm items-center flex-wrap">
						<Health
							state={state}
							isConnected={isConnected}
							onClick={showSetup}
						/>
						{isConnected ? (
							<ScannerHealth state={state} onClick={showSetup} />
						) : null}
					</div>
				</div>
				<FeaturedMatch state={state} />
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
					<div className="stack md">
						<LiveTimer state={state} now={now} />
						<OnAirControls state={state} />
						<ShowInfo state={state} />
					</div>
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
						isDisabled={!canTake}
						className={styles.take}
						formClassName={styles.takeForm}
						testId="broadcast-take-button"
					>
						{t("broadcast:dashboard.take")}
					</ActionButton>
					<AutoTake
						state={state}
						canTake={canTake}
						remainingMs={
							autoTakeAt !== null && now !== null ? autoTakeAt - now : null
						}
					/>
					<SendouButton
						size="small"
						variant="minimal"
						icon={<Play />}
						onClick={rehearse}
						title={t("broadcast:dashboard.rehearseHint")}
						testId="broadcast-rehearse-button"
					>
						{t("broadcast:dashboard.rehearse")}
					</SendouButton>
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
					<div className={styles.staging}>
						<Queue
							state={state}
							selected={selected}
							onSelect={setSelectedItemId}
							areClipsOnSources={areClipsOnSources}
						/>
						<SceneEditor state={state} selected={selected} />
					</div>
				</section>
			</div>

			<div ref={settingsRef} className={styles.settings}>
				<SendouTabs
					selectedKey={tab}
					onSelectionChange={(key) => setTab(key as DashboardTab)}
				>
					<SendouTabList>
						{BROADCAST_DASHBOARD_TABS.map((dashboardTab) => {
							const Icon = TAB_ICONS[dashboardTab];

							return (
								<SendouTab
									key={dashboardTab}
									id={dashboardTab}
									icon={<Icon />}
									alert={
										dashboardTab === "setup" &&
										(!isConnected || state.health.sources === 0)
									}
								>
									{t(`broadcast:dashboard.tab.${dashboardTab}`)}
								</SendouTab>
							);
						})}
					</SendouTabList>
					<SendouTabPanel id="setup">
						<Setup
							state={state}
							programUrl={`${Config.siteDomain}${broadcastOverlayPage(pageArgs)}`}
							scannerLink={pageArgs}
							statuses={clipSender.statuses}
							areClipsOnSources={areClipsOnSources}
						/>
					</SendouTabPanel>
					<SendouTabPanel id="theme">
						<Theme state={state} designUrl={broadcastDesignPage(pageArgs)} />
					</SendouTabPanel>
				</SendouTabs>
			</div>
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
	onClick,
}: {
	state: CastBroadcastState;
	isConnected: boolean;
	onClick: () => void;
}) {
	const { t } = useTranslation(["broadcast"]);

	const variant = !isConnected
		? "outlined-warning"
		: state.health.sources > 0
			? "outlined-success"
			: "outlined";

	return (
		<SendouButton
			size="small"
			variant={variant}
			icon={
				variant === "outlined-success" ? <CircleCheck /> : <TriangleAlert />
			}
			onClick={onClick}
		>
			{isConnected
				? t("broadcast:dashboard.health.sources", {
						count: state.health.sources,
					})
				: t("broadcast:dashboard.health.disconnected")}
		</SendouButton>
	);
}

/** Whether a scanner is connected, a warning while a staged item waits for a game none is there to see. */
function ScannerHealth({
	state,
	onClick,
}: {
	state: CastBroadcastState;
	onClick: () => void;
}) {
	const { t } = useTranslation(["broadcast"]);
	const isConnected = state.health.scanners > 0;
	const isWaitedFor =
		Producer.effectiveAdvance(CAST_PRODUCER_RULES, state.live, state.next) ===
		"game";

	return (
		<SendouButton
			size="small"
			variant={
				isConnected
					? "outlined-success"
					: isWaitedFor
						? "outlined-warning"
						: "outlined"
			}
			icon={isConnected ? <CircleCheck /> : <ScanEye />}
			title={
				!isConnected && isWaitedFor
					? t("broadcast:dashboard.noScannerHint")
					: undefined
			}
			onClick={onClick}
		>
			{isConnected
				? t("broadcast:dashboard.health.scannerConnected")
				: t("broadcast:dashboard.health.noScanner")}
		</SendouButton>
	);
}

function FeaturedMatch({ state }: { state: CastBroadcastState }) {
	const { t } = useTranslation(["broadcast", "q"]);
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	if (!state.match) {
		return (
			<Alert variation="WARNING" alertClassName={styles.alert}>
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
					<span className="text-lighter">· {t("q:match.pool")}</span>{" "}
					<span className="font-semi-bold">{joinInfo.pool}</span>{" "}
					<span className="text-lighter">{t("q:match.password.short")}</span>{" "}
					<span className="font-semi-bold">{joinInfo.pass}</span>
				</span>
			) : null}
		</div>
	);
}

/** Changes to what is on air that apply right away, without a Take. */
function OnAirControls({ state }: { state: CastBroadcastState }) {
	if (!state.match) return null;

	return (
		<div className={styles.onAir}>
			<InkColors state={state} match={state.match} />
			<ResultsNotOnAir match={state.match} />
		</div>
	);
}

/** What every scene shares, on air as soon as it's saved. */
function ShowInfo({ state }: { state: CastBroadcastState }) {
	return (
		<div className={styles.onAir}>
			<CastersForm casterIds={state.settings.casterIds} />
			<HeadlineForm headline={state.settings.headline} />
		</div>
	);
}

function InkColors({
	state,
	match,
}: {
	state: CastBroadcastState;
	match: BroadcastMatch;
}) {
	const { t } = useTranslation(["broadcast"]);
	const ink = gameInk(state, "live");
	const isFlipped = ink?.isFlipped ?? false;
	const colors = inkColorVars({ ink, swapSides: state.live.swapSides });
	const sides = matchSides(match, "live", state.live);
	const gameOnAir = {
		matchId: match.id,
		resultCount: match.progress.live.resultCount,
	};

	return (
		<div className="stack sm">
			<div className={styles.inkTeams}>
				{sides.map((side) => (
					<span
						key={side.side}
						className={styles.inkTeam}
						data-side={side.side}
					>
						<span
							className={styles.inkDot}
							style={{ background: colors[`--bc-team-${side.side}`] }}
						/>
						<span className="truncate">
							{side.team?.name ?? t("broadcast:overlay.tbd")}
						</span>
					</span>
				))}
				{/* rendered without ink colors too, only hidden, so picking them doesn't shift the layout */}
				<ActionButton
					schema={broadcastActionSchema}
					action="SET_INK"
					fields={{ key: ink?.key, isFlipped: !isFlipped, ...gameOnAir }}
					variant="minimal"
					size="miniscule"
					shape="square"
					icon={<ArrowLeftRight />}
					className={clsx({ [styles.invisible]: !ink })}
					formClassName={styles.inkFlip}
					title={t("broadcast:dashboard.ink.flip")}
					aria-label={t("broadcast:dashboard.ink.flip")}
					testId="broadcast-ink-flip"
				/>
			</div>
			<div className={styles.inkSwatches}>
				{BROADCAST_INK_COLORS.map((color) => {
					// each swatch is split the way the teams are on air, left team's color on the left
					const swatch = inkColorVars({
						ink: { key: color.key, isFlipped },
						swapSides: state.live.swapSides,
					});

					return (
						<ActionButton
							key={color.key}
							schema={broadcastActionSchema}
							action="SET_INK"
							fields={{ key: color.key, isFlipped, ...gameOnAir }}
							variant="minimal"
							className={clsx(styles.inkSwatch, {
								[styles.inkSwatchSelected]: ink?.key === color.key,
							})}
							formClassName={styles.inkSwatchForm}
							title={t(`broadcast:ink.${color.key}`)}
							aria-label={t(`broadcast:ink.${color.key}`)}
							testId={`broadcast-ink-${color.key}`}
						>
							<span style={{ background: swatch["--bc-team-a"] }} />
							<span style={{ background: swatch["--bc-team-b"] }} />
						</ActionButton>
					);
				})}
				<ActionButton
					schema={broadcastActionSchema}
					action="SET_INK"
					fields={{ isFlipped: false, ...gameOnAir }}
					variant="minimal"
					icon={<X />}
					className={clsx(styles.inkSwatch, styles.inkClear, {
						[styles.invisible]: !ink,
					})}
					formClassName={styles.inkSwatchForm}
					title={t("broadcast:dashboard.ink.clear")}
					aria-label={t("broadcast:dashboard.ink.clear")}
					testId="broadcast-ink-clear"
				/>
			</div>
		</div>
	);
}

function ResultsNotOnAir({ match }: { match: BroadcastMatch }) {
	const { t } = useTranslation(["broadcast"]);

	const { live, next } = match.progress;
	const notOnAirCount = next.resultCount - live.resultCount;
	if (notOnAirCount <= 0) return null;

	return (
		<div className="stack horizontal sm items-center justify-between flex-wrap">
			<span className="text-xs text-warning">
				{t("broadcast:dashboard.resultsNotOnAir", {
					count: notOnAirCount,
					live: live.scores.join("–"),
					next: next.scores.join("–"),
				})}
			</span>
			<ActionButton
				schema={broadcastActionSchema}
				action="SHOW_RESULTS"
				fields={{ matchId: match.id, resultCount: next.resultCount }}
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
	state: CastBroadcastState;
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

/** Time left of the scene on air, only while next goes on air by itself once it runs out (not held or waiting for a game event). */
function LiveTimer({
	state,
	now,
}: {
	state: CastBroadcastState;
	now: number | null;
}) {
	const { t } = useTranslation(["broadcast"]);
	const startedAt = Producer.liveStartedAt(state);
	const endsAt = Producer.liveEndsAt(CAST_PRODUCER_RULES, state);

	if (
		startedAt === null ||
		endsAt === null ||
		now === null ||
		Producer.autoTakeAt(CAST_PRODUCER_RULES, state, {
			hasMatch: state.match !== null,
		}) === null
	) {
		return null;
	}

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
	canTake,
	remainingMs,
}: {
	state: CastBroadcastState;
	canTake: boolean;
	/** `null` when next isn't timed. */
	remainingMs: number | null;
}) {
	const { t } = useTranslation(["broadcast"]);

	if (!canTake) {
		return (
			<div className={styles.autoTake}>
				<span className={styles.autoTakeBlocked}>
					{t("broadcast:dashboard.needsMatch")}
				</span>
			</div>
		);
	}

	const gameCue =
		Producer.effectiveAdvance(CAST_PRODUCER_RULES, state.live, state.next) ===
		"game"
			? Producer.gameCue(CAST_PRODUCER_RULES, state.live, state.next)
			: null;

	if (remainingMs === null && gameCue === null) {
		return <div className={styles.autoTake} />;
	}

	return (
		<div className={styles.autoTake}>
			{remainingMs !== null ? (
				<span className={styles.autoTakeCountdown}>
					{t("broadcast:dashboard.autoIn", { time: formatClock(remainingMs) })}
				</span>
			) : (
				<span className={styles.autoTakeCue}>
					<ScanEye size={14} />
					{gameCue === "start"
						? t("broadcast:dashboard.onGameStart")
						: t("broadcast:dashboard.onGameEnd")}
				</span>
			)}
			<ActionButton
				schema={broadcastActionSchema}
				action="SET_ADVANCE"
				fields={{ itemId: state.next.id, advance: "take" }}
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

/** The staged items in the order they go on air, as tabs of the scene editor under them editing the one picked. */
function Queue({
	state,
	selected,
	onSelect,
	areClipsOnSources,
}: {
	state: CastBroadcastState;
	selected: CastProducerState;
	onSelect: (itemId: number) => void;
	areClipsOnSources: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);
	const tournament = useTournament();
	const { submit } = useActionSubmit(broadcastActionSchema);
	const staged = Producer.stagedItems(state);

	return (
		<ol
			className={styles.queue}
			aria-label={t("broadcast:dashboard.queue.header")}
		>
			{staged.map((item, idx) => {
				const Icon = SCENE_ICONS[item.scene];
				const isSelected = item.id === selected.id;
				const warning = isItemMissingMatch(state, item)
					? t("broadcast:dashboard.needsMatch")
					: item.scene === "replays" &&
							item.clipId !== null &&
							!areClipsOnSources
						? t("broadcast:dashboard.queue.clipMissing")
						: null;
				const detail = itemDetail(
					item,
					item.scene === "team"
						? pickedTeamName({ state, tournament, item })
						: undefined,
				);

				return (
					<li key={item.id} className={styles.queueEntry}>
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
								{detail ? (
									<span className="text-xs text-lighter">{detail}</span>
								) : null}
								{warning ? (
									<span
										role="img"
										className={styles.queueWarning}
										title={warning}
										aria-label={warning}
									>
										<TriangleAlert size={14} />
									</span>
								) : null}
							</button>
							{isSelected && staged.length > 1 ? (
								<>
									<ActionButton
										schema={broadcastActionSchema}
										action="MOVE_IN_QUEUE"
										fields={{ itemId: item.id, direction: "earlier" }}
										variant="minimal"
										size="miniscule"
										shape="square"
										icon={<ChevronLeft />}
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
										icon={<ChevronRight />}
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
										aria-label={t("broadcast:dashboard.queue.remove")}
										testId={`broadcast-queue-remove-${idx}`}
									/>
								</>
							) : null}
						</div>
					</li>
				);
			})}
			<li className={styles.queueEntry}>
				<SendouButton
					variant="minimal"
					size="small"
					shape="square"
					icon={<Plus />}
					className={styles.queueAdd}
					onClick={() => {
						submit("ADD_TO_QUEUE");
						// the item queued gets the id after the last one given
						onSelect(state.lastItemId + 1);
					}}
					title={t("broadcast:dashboard.queue.add")}
					aria-label={t("broadcast:dashboard.queue.add")}
					testId="broadcast-queue-add"
				/>
			</li>
		</ol>
	);
}

const ADVANCE_ICONS: Record<BroadcastAdvance, LucideIcon> = {
	take: Hand,
	timer: Link2,
	game: ScanEye,
};

/** What puts the item on air besides a Take, picked from what can happen after the item before it. */
function QueueGap({
	before,
	item,
}: {
	before: CastProducerState;
	item: CastProducerState;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	const gameCue = Producer.gameCue(CAST_PRODUCER_RULES, before, item);
	const options = BROADCAST_ADVANCES.filter(
		(advance) =>
			advance === "take" ||
			(advance === "timer" &&
				Producer.lengthMs(CAST_PRODUCER_RULES, before) !== null) ||
			(advance === "game" && gameCue !== null),
	);
	const current = Producer.effectiveAdvance(CAST_PRODUCER_RULES, before, item);

	const label = (advance: BroadcastAdvance) => {
		if (advance === "take") return t("broadcast:dashboard.queue.onTake");
		if (advance === "timer") return t("broadcast:dashboard.queue.auto");

		return gameCue === "start"
			? t("broadcast:dashboard.queue.onGameStart")
			: t("broadcast:dashboard.queue.onGameEnd");
	};
	const hint = (advance: BroadcastAdvance) => {
		if (advance === "take") return t("broadcast:dashboard.queue.onTakeHint");
		if (advance === "timer") return t("broadcast:dashboard.queue.autoHint");

		return gameCue === "start"
			? t("broadcast:dashboard.queue.onGameStartHint")
			: t("broadcast:dashboard.queue.onGameEndHint");
	};
	const CurrentIcon = ADVANCE_ICONS[current];

	if (options.length === 1) {
		return (
			<span
				role="img"
				className={styles.queueGap}
				title={hint("take")}
				aria-label={label("take")}
			>
				<Hand size={14} />
			</span>
		);
	}

	return (
		<span className={styles.queueGap}>
			<SendouMenu
				trigger={
					<SendouButton
						variant="minimal"
						size="miniscule"
						shape="square"
						icon={<CurrentIcon />}
						className={clsx(styles.queueGapToggle, {
							[styles.queueGapAuto]: current !== "take",
						})}
						title={hint(current)}
						aria-label={label(current)}
					/>
				}
			>
				{options.map((advance) => {
					const Icon = ADVANCE_ICONS[advance];

					return (
						<SendouMenuItem
							key={advance}
							icon={<Icon size={16} />}
							isActive={advance === current}
							onAction={() =>
								submit("SET_ADVANCE", { itemId: item.id, advance })
							}
						>
							{hint(advance)}
						</SendouMenuItem>
					);
				})}
			</SendouMenu>
		</span>
	);
}

/** The selected staged item: its scene and only the settings that scene uses. */
function SceneEditor({
	state,
	selected,
}: {
	state: CastBroadcastState;
	selected: CastProducerState;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className={styles.editor}>
			<div className="stack sm">
				<ScenePicker
					selected={selected.scene}
					liveScene={state.live.scene}
					isDisabled={(scene) => isSceneMissingMatch(state, scene)}
					renderTile={(scene, tile) => (
						<ActionButton
							schema={broadcastActionSchema}
							action="SET_SCENE"
							fields={{ itemId: selected.id, scene }}
							className={tile.className}
							isDisabled={tile.isDisabled}
							title={
								tile.isDisabled
									? t("broadcast:dashboard.needsMatch")
									: undefined
							}
							testId={`broadcast-scene-${scene}`}
						>
							{tile.children}
						</ActionButton>
					)}
				/>
				{state.match ? null : (
					<span className="text-xs text-lighter">
						{t("broadcast:dashboard.matchScenesOff")}
					</span>
				)}
			</div>
			<div className={styles.properties}>
				<TransitionProperty selected={selected} />
				{state.match ? (
					<SwapSides match={state.match} selected={selected} />
				) : null}
				{selected.scene === "bracket" ? (
					<BracketProperties selected={selected} />
				) : null}
				{selected.scene === "replays" ? (
					<ClipProperty selected={selected} />
				) : null}
				{selected.scene === "team" ? (
					<TeamProperty state={state} selected={selected} />
				) : null}
				<DurationProperty selected={selected} />
			</div>
		</div>
	);
}

function Property({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.property}>
			<span className={styles.propertyLabel}>{label}</span>
			<div className="stack sm">{children}</div>
		</div>
	);
}

function TransitionProperty({ selected }: { selected: CastProducerState }) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);

	return (
		<Property label={t("broadcast:dashboard.transition")}>
			<SendouChipRadioGroup aria-label={t("broadcast:dashboard.transition")}>
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
		</Property>
	);
}

function SwapSides({
	match,
	selected,
}: {
	match: BroadcastMatch;
	selected: CastProducerState;
}) {
	const { t } = useTranslation(["broadcast"]);
	const [left, right] = matchSides(match, "next", selected);

	return (
		<Property label={t("broadcast:dashboard.sides.label")}>
			<div className="stack horizontal sm items-center flex-wrap">
				<span className="text-sm font-semi-bold">
					{left.team?.name ?? t("broadcast:overlay.tbd")}
				</span>
				<ActionButton
					schema={broadcastActionSchema}
					action="SET_SWAP_SIDES"
					fields={{ itemId: selected.id, swapSides: !selected.swapSides }}
					variant="outlined"
					size="miniscule"
					icon={<ArrowLeftRight />}
					testId="broadcast-swap-sides"
				>
					{t("broadcast:dashboard.sides.swap")}
				</ActionButton>
				<span className="text-sm font-semi-bold">
					{right.team?.name ?? t("broadcast:overlay.tbd")}
				</span>
			</div>
		</Property>
	);
}

function BracketProperties({ selected }: { selected: CastProducerState }) {
	const { t } = useTranslation(["broadcast"]);
	const tournament = useTournament();
	const { submit } = useActionSubmit(broadcastActionSchema);
	const showableIdxs = BracketFocus.showableBracketIdxs(tournament);

	if (showableIdxs.length === 0) {
		return (
			<Property label={t("broadcast:dashboard.bracket.focus")}>
				<span className="text-sm text-lighter">
					{t("broadcast:dashboard.bracket.none")}
				</span>
			</Property>
		);
	}

	const hasDoubleElimination = showableIdxs.some(
		(idx) => tournament.bracketsMeta[idx].type === "double_elimination",
	);

	return (
		<>
			{hasDoubleElimination ? (
				<Property label={t("broadcast:dashboard.bracket.focus")}>
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
					<span className="text-xs text-lighter">
						{t("broadcast:dashboard.bracket.explanation")}
					</span>
				</Property>
			) : null}
			{showableIdxs.length > 1 ? (
				<Property label={t("broadcast:dashboard.bracket.bracket")}>
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
				</Property>
			) : null}
		</>
	);
}

function ClipProperty({ selected }: { selected: CastProducerState }) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);

	return (
		<Property label={t("broadcast:dashboard.clips.label")}>
			<SendouChipRadioGroup
				aria-label={t("broadcast:dashboard.clips.label")}
				wrap
			>
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
			<span className="text-xs text-lighter">
				{t("broadcast:dashboard.clips.explanation")}
			</span>
		</Property>
	);
}

function TeamProperty({
	state,
	selected,
}: {
	state: CastBroadcastState;
	selected: CastProducerState;
}) {
	const { t } = useTranslation(["broadcast"]);
	const tournament = useTournament();
	const { submit } = useActionSubmit(broadcastActionSchema);
	const featuredSides = state.match
		? matchSides(state.match, "next", selected)
		: null;
	const featuredItem = (teamPick: "left" | "right", idx: 0 | 1) => ({
		id: teamPick,
		name: `${t(`broadcast:dashboard.team.${teamPick}`)} · ${
			featuredSides?.[idx].team?.name ?? t("broadcast:overlay.tbd")
		}`,
	});
	const items = [
		...(featuredSides
			? [featuredItem("left", 0), featuredItem("right", 1)]
			: []),
		...tournament.ctx.teams.map((team) => ({ id: team.id, name: team.name })),
	];

	return (
		<Property label={t("broadcast:dashboard.team.label")}>
			<SendouSelect
				aria-label={t("broadcast:dashboard.team.label")}
				items={items}
				selectedKey={selected.teamPick}
				onSelectionChange={(key) => {
					if (typeof key === "number" || key === "left" || key === "right") {
						submit("SET_TEAM", { itemId: selected.id, teamPick: key });
					}
				}}
				search={{ placeholder: t("broadcast:dashboard.team.search") }}
				data-testid="broadcast-team-select"
			>
				{(item) => (
					<SendouSelectItem key={item.id} id={item.id}>
						{item.name}
					</SendouSelectItem>
				)}
			</SendouSelect>
			<span className="text-xs text-lighter">
				{t("broadcast:dashboard.team.explanation")}
			</span>
		</Property>
	);
}

function DurationProperty({ selected }: { selected: CastProducerState }) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	const durations = BROADCAST_SCENE_DURATIONS_MS[selected.scene];

	if (!durations) return null;

	return (
		<Property label={t("broadcast:dashboard.duration.label")}>
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
				{durations.optionsMs.map((durationMs) => (
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
			{selected.scene === "starting" ? (
				<span className="text-xs text-lighter">
					{t("broadcast:dashboard.duration.countdown")}
				</span>
			) : null}
		</Property>
	);
}

function HeadlineForm({ headline }: { headline: string }) {
	return (
		<SendouForm
			schema={broadcastHeadlineFormSchema}
			defaultValues={{ headline: headline || null }}
			submitButtonSize="small"
			fullWidth
		>
			{({ FormField }) => <FormField name="headline" />}
		</SendouForm>
	);
}

function CastersForm({ casterIds }: { casterIds: number[] }) {
	return (
		<SendouForm
			schema={broadcastCastersFormSchema}
			defaultValues={{ casterIds }}
			mode="autoSubmit"
			fullWidth
		>
			{({ FormField }) => <FormField name="casterIds" />}
		</SendouForm>
	);
}

function Setup({
	state,
	programUrl,
	scannerLink,
	statuses,
	areClipsOnSources,
}: {
	state: CastBroadcastState;
	programUrl: string;
	scannerLink: { tournamentId: number; slug: string };
	statuses: ClipTransfer.ClipPeerStatus[];
	areClipsOnSources: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);
	const sourceCount = state.health.sources;
	const linkedBroadcast = useLinkedBroadcast();
	const isScannerLinked =
		linkedBroadcast?.tournamentId === scannerLink.tournamentId &&
		linkedBroadcast.slug === scannerLink.slug;

	return (
		<div className="stack xl">
			<section className="stack md">
				<div className="stack horizontal xs items-center">
					<h2 className={styles.panelHeader}>
						{t("broadcast:dashboard.setup.header")}
					</h2>
					<InfoPopover tiny>
						{t("broadcast:dashboard.setup.program")}
					</InfoPopover>
				</div>
				<InviteLinkInput
					label={t("broadcast:dashboard.setup.programLabel")}
					link={programUrl}
				/>
				<ul className={styles.checklist}>
					<SetupCheck isDone={sourceCount > 0}>
						{t("broadcast:dashboard.health.sources", { count: sourceCount })}
					</SetupCheck>
					<SetupCheck isDone={sourceCount > 0 && areClipsOnSources}>
						{t("broadcast:dashboard.setup.clipsSynced")}
					</SetupCheck>
				</ul>
				<ClipOverlays statuses={statuses} />
			</section>
			<section className="stack md">
				<h2 className={styles.panelHeader}>
					{t("broadcast:dashboard.setup.scannerHeader")}
				</h2>
				<p className="text-sm text-lighter">
					{t("broadcast:dashboard.setup.scanner")}
				</p>
				<ul className={styles.checklist}>
					<SetupCheck isDone={state.health.scanners > 0}>
						{state.health.scanners > 0
							? t("broadcast:dashboard.health.scannerConnected")
							: t("broadcast:dashboard.health.noScanner")}
					</SetupCheck>
				</ul>
				{linkedBroadcast && !isScannerLinked ? (
					<p className="text-xs text-warning">
						{t("broadcast:dashboard.setup.scannerLinkedElsewhere")}
					</p>
				) : null}
				<SendouButton
					size="small"
					variant="outlined"
					icon={isScannerLinked ? <Unlink /> : <ScanEye />}
					onClick={() => linkBroadcast(isScannerLinked ? null : scannerLink)}
					className="self-start"
				>
					{isScannerLinked
						? t("broadcast:dashboard.setup.unlinkScanner")
						: t("broadcast:dashboard.setup.linkScanner")}
				</SendouButton>
			</section>
		</div>
	);
}

function SetupCheck({
	isDone,
	children,
}: {
	isDone: boolean;
	children: React.ReactNode;
}) {
	return (
		<li className={styles.check} data-done={isDone || undefined}>
			{isDone ? <CircleCheck size={18} /> : <CircleDashed size={18} />}
			{children}
		</li>
	);
}

function ClipOverlays({
	statuses,
}: {
	statuses: ClipTransfer.ClipPeerStatus[];
}) {
	const { t } = useTranslation(["broadcast"]);
	const shownStatuses = withOnePreview(statuses);

	return (
		<div className="stack xs text-sm">
			<span className="font-semi-bold">
				{t("broadcast:dashboard.clips.overlays")}
			</span>
			{shownStatuses.length === 0 ? (
				<span className="text-lighter">
					{t("broadcast:dashboard.clips.noOverlays")}
				</span>
			) : (
				shownStatuses.map((status) => (
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
	);
}

function Theme({
	state,
	designUrl,
}: {
	state: CastBroadcastState;
	designUrl: string;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className="stack lg">
			<div className="stack xs items-start">
				<LinkButton to={designUrl} size="small" icon={<Brush />}>
					{t("broadcast:dashboard.theme.design")}
				</LinkButton>
				<span className="text-xs text-lighter">
					{t("broadcast:dashboard.theme.designHint")}
				</span>
			</div>
			<SendouForm
				schema={broadcastThemeFormSchema}
				defaultValues={{
					weaponImages: state.settings.weaponImages,
					css: state.settings.css || null,
				}}
				fullWidth
			>
				{({ FormField }) => (
					<>
						<FormField name="weaponImages" />
						<FormField name="css" />
					</>
				)}
			</SendouForm>
		</div>
	);
}

/** Whether every OBS source has every clip, one going on air without it shows the OBS footage instead. */
function everySourceHasClips(statuses: ClipTransfer.ClipPeerStatus[]) {
	return statuses
		.filter((status) => status.peer.role === "source")
		.every(hasEveryClip);
}

function hasEveryClip(status: ClipTransfer.ClipPeerStatus) {
	return status.missingCount === 0 || status.transferMs !== null;
}

/** The dashboard's live and next previews as one row, the one still missing clips if either is. */
function withOnePreview(statuses: ClipTransfer.ClipPeerStatus[]) {
	const previews = statuses.filter((status) => status.peer.role === "preview");
	const preview =
		previews.find((status) => !hasEveryClip(status)) ?? previews[0];

	return statuses.filter(
		(status) => status.peer.role !== "preview" || status === preview,
	);
}

/** Name of the team the item's team scene shows, `undefined` while the featured match's isn't decided. */
function pickedTeamName({
	state,
	tournament,
	item,
}: {
	state: CastBroadcastState;
	tournament: ReturnType<typeof useTournament>;
	item: CastProducerState;
}) {
	if (typeof item.teamPick === "number") {
		return tournament.teamById(item.teamPick)?.name;
	}
	if (!state.match) return undefined;

	return matchSides(state.match, "next", item)[item.teamPick === "left" ? 0 : 1]
		.team?.name;
}

/** Clip or team and length of a staged item, e.g. "4 splats · 0:25". */
function itemDetail(item: CastProducerState, teamName?: string) {
	const clip = BROADCAST_PROTOTYPE_CLIPS.find(
		(prototypeClip) =>
			item.scene === "replays" && prototypeClip.id === item.clipId,
	);
	const length = Producer.lengthMs(CAST_PRODUCER_RULES, item);

	return [clip?.name, teamName, length !== null ? formatClock(length) : null]
		.filter(Boolean)
		.join(" · ");
}

/** The scene shows the featured match's teams while no match is cast, see `needsFeaturedMatch`. */
function isSceneMissingMatch(state: CastBroadcastState, scene: CastScene) {
	return !state.match && needsFeaturedMatch(scene);
}

/** Like {@link isSceneMissingMatch}, the team scene also when it follows one of the match's sides. */
function isItemMissingMatch(
	state: CastBroadcastState,
	item: CastProducerState,
) {
	return !state.match && needsFeaturedMatch(item.scene, item.teamPick);
}
