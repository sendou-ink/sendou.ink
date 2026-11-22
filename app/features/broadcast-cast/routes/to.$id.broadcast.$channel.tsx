import type { DragEndEvent } from "@dnd-kit/core";
import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
	horizontalListSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import {
	ArrowLeftRight,
	Brush,
	Cable,
	ChevronsLeft,
	CircleCheck,
	CircleDashed,
	Hand,
	KeyRound,
	type LucideIcon,
	MonitorUp,
	Palette,
	Pause,
	Play,
	Plus,
	RefreshCw,
	ScanEye,
	SquareArrowOutUpRight,
	TriangleAlert,
	X,
} from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useNavigate, useRevalidator } from "react-router";
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
import { useUser } from "~/features/auth/core/user";
import {
	BROADCAST_INK_COLORS,
	BROADCAST_REHEARSE_MESSAGE,
	BROADCAST_TRANSITIONS,
} from "~/features/broadcast/broadcast-constants";
import {
	useBroadcastStream,
	useClipSender,
	useServerNow,
} from "~/features/broadcast/broadcast-hooks";
import type {
	BroadcastAdvance,
	BroadcastChannel,
	BroadcastMatch,
	BroadcastObsAudio,
	BroadcastView,
} from "~/features/broadcast/broadcast-types";
import {
	broadcastDashboardPage,
	broadcastDesignPage,
	broadcastOverlayPage,
	broadcastProgramPage,
	broadcastSignalUrl,
	broadcastStreamUrl,
} from "~/features/broadcast/broadcast-urls";
import {
	formatClock,
	gameInk,
	inkColorVars,
	type MatchSide,
	matchSides,
	roundLabel,
} from "~/features/broadcast/broadcast-utils";
import { BroadcastPreview } from "~/features/broadcast/components/BroadcastPreview";
import * as AudioFeeds from "~/features/broadcast/core/AudioFeeds";
import type * as ClipTransfer from "~/features/broadcast/core/ClipTransfer";
import * as Producer from "~/features/broadcast/core/Producer";
import { useCapturedBefore } from "~/features/scanner/scanner-activity";
import type { ScannerClip } from "~/features/scanner/store/clips";
import { useTournament } from "~/features/tournament/tournament-context";
import { SendouForm } from "~/form/SendouForm";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useSearchParam } from "~/modules/search-params/hooks";
import type { SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BROADCAST_OVERLAYS_DOC_LINK,
	SCANNER_PAGE,
	tournamentAdminPage,
	tournamentMatchPage,
} from "~/utils/urls";
import {
	broadcastClipTitle,
	useClipSources,
	useScannerClips,
} from "../broadcast-cast-clips";
import {
	BROADCAST_DASHBOARD_TABS,
	BROADCAST_OBS_WEBSOCKET_DEFAULT_PORT,
	BROADCAST_SCENE_DURATIONS_MS,
	CAST_PRODUCER_RULES,
} from "../broadcast-cast-constants";
import { ADVANCE_ICONS, SCENE_ICONS } from "../broadcast-cast-icons";
import {
	broadcastActionSchema,
	broadcastCastersFormSchema,
	broadcastHeadlineFormSchema,
	broadcastObsAudioFormSchema,
} from "../broadcast-cast-schemas";
import { broadcastDashboardSearchParams } from "../broadcast-cast-search-params";
import type {
	BroadcastBracketSide,
	BroadcastBracketSideFocus,
	CastBroadcastState,
	CastProducerState,
	CastScene,
} from "../broadcast-cast-types";
import { needsFeaturedMatch } from "../broadcast-cast-utils";
import { CasterFeedsHealth, CasterMixer } from "../components/CasterMixer";
import { ClipPicker } from "../components/ClipPicker";
import { ObsCaptureCardField } from "../components/ObsCaptureCardField";
import { ScenePicker, useSceneHotkeys } from "../components/ScenePicker";
import * as BracketFocus from "../core/BracketFocus";
import * as CastChannel from "../core/CastChannel";
import * as CastTake from "../core/CastTake";
import { loader } from "../loaders/to.$id.broadcast.$channel.server";
import styles from "./to.$id.broadcast.$channel.module.css";

export { action } from "../actions/to.$id.broadcast.$channel.server";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["broadcast", "q"],
	showScanner: true,
};

type DashboardTab = (typeof BROADCAST_DASHBOARD_TABS)[number];

const TAB_ICONS: Record<DashboardTab, LucideIcon> = {
	setup: Cable,
	theme: Palette,
};

export default function BroadcastDashboardPage() {
	const data = useLoaderData<typeof loader>();

	// remounts per channel so a switch doesn't carry the previous channel's stream, selection and clips over
	return <BroadcastDashboard key={data.channel.slug} />;
}

/**
 * Control panel of one broadcast: the live and the staged ("next") overlay side by side, Take puts next on air.
 * Left of Take is what is on air, right of it what goes on air next: the queue and the selected item's scene.
 * Under them the show settings set up OBS and the scanner, and theme the overlays.
 */
function BroadcastDashboard() {
	const { t } = useTranslation(["broadcast"]);
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();
	const pageArgs = { tournamentId: tournament.ctx.id, slug: data.channel.slug };
	const channels = CastChannel.list(tournament.ctx.castAccounts);
	const [feedStore] = React.useState(AudioFeeds.createStore);
	const { state, isConnected, clockOffsetMs } = useBroadcastStream({
		url: broadcastStreamUrl({ ...pageArgs, role: "dashboard" }),
		initialState: data.state,
		onMessage: (message) => clipSender.onMessage(message),
	});
	const scannerClips = useScannerClips(useCapturedBefore() ? pageArgs : null);
	// only the browser running the scanner has its clips, the dashboards elsewhere send none
	const isClipSender = scannerClips.length > 0;
	const clipSender = useClipSender({
		signalUrl: broadcastSignalUrl(pageArgs),
		clips: useClipSources(state, scannerClips),
		onFeeds: feedStore.report,
	});
	const nextPreviewRef = React.useRef<HTMLIFrameElement>(null);
	const mixerRef = React.useRef<HTMLElement>(null);
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
	const take = CastTake.status({ state, now });
	// elsewhere the OBS sources get the clips from the scanner's browser, out of this dashboard's sight
	const isClipOnSources = (clipId: string) =>
		!isClipSender || isOnEverySource(clipSender.statuses, clipId);
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
					<div className="stack horizontal md items-center flex-wrap">
						<h1 className="text-lg">
							{channels.length > 1
								? t("broadcast:title")
								: `${t("broadcast:title")} · ${data.channel.name}`}
						</h1>
						<ChannelSwitcher channels={channels} />
					</div>
					<div className="stack horizontal sm items-center flex-wrap">
						<Health
							state={state}
							isConnected={isConnected}
							onClick={showSetup}
						/>
						{isConnected ? (
							<ScannerHealth state={state} onClick={showSetup} />
						) : null}
						<CasterFeedsHealth
							casters={state.casters}
							feedStore={feedStore}
							onClick={() =>
								mixerRef.current?.scrollIntoView({
									behavior: "smooth",
									block: "center",
								})
							}
						/>
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
						<LiveTimer
							state={state}
							now={now}
							isTimed={take.remainingMs !== null}
						/>
						<OnAirControls state={state} />
						<CasterMixer
							ref={mixerRef}
							casters={state.casters}
							feedStore={feedStore}
						/>
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
						isDisabled={!take.canTake}
						className={styles.take}
						formClassName={styles.takeForm}
						testId="broadcast-take-button"
					>
						{t("broadcast:dashboard.take")}
					</ActionButton>
					<AutoTake state={state} take={take} />
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
					<ViewHeader view="next" state={state} isImminent={take.isImminent} />
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
							isClipOnSources={isClipOnSources}
						/>
						<SceneEditor
							state={state}
							selected={selected}
							scannerClips={isClipSender ? scannerClips : null}
						/>
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
							program={data.program}
							statuses={clipSender.statuses}
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

/** Switches to the dashboard of another of the tournament's cast channels, organizers can also add channels. */
function ChannelSwitcher({ channels }: { channels: BroadcastChannel[] }) {
	const { t } = useTranslation(["broadcast"]);
	const tournament = useTournament();
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const navigate = useNavigate();
	const canAddChannel =
		tournament.isOrganizer(user) && !tournament.ctx.isFinalized;

	return (
		<div className="stack horizontal sm items-center flex-wrap">
			{channels.length > 1 ? (
				<SendouChipRadioGroup aria-label={t("broadcast:dashboard.channel")}>
					{channels.map((channel) => (
						<SendouChipRadio
							key={channel.slug}
							name="broadcast-channel"
							value={channel.slug}
							checked={channel.slug === data.channel.slug}
							onChange={() =>
								navigate(
									broadcastDashboardPage({
										tournamentId: tournament.ctx.id,
										slug: channel.slug,
									}),
								)
							}
						>
							{channel.name}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
			) : null}
			{canAddChannel ? (
				<LinkButton
					to={`${tournamentAdminPage(tournament.ctx.id)}/stream`}
					size="small"
					variant="minimal"
					icon={<Plus />}
				>
					{t("broadcast:addChannel")}
				</LinkButton>
			) : null}
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
				? state.health.sources > 0
					? t("broadcast:dashboard.health.obsConnected")
					: t("broadcast:dashboard.health.obsNotConnected")
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
	const colors = inkColorVars(ink);
	const [left, right] = matchSides(match, "live", state);
	const gameOnAir = {
		matchId: match.id,
		resultCount: match.progress.live.resultCount,
	};
	const inkTeam = (side: MatchSide) => (
		<span className={styles.inkTeam} data-side={side.side}>
			<span
				className={styles.inkDot}
				style={{ background: colors[`--bc-team-${side.side}`] }}
			/>
			<span className="truncate">
				{side.team?.name ?? t("broadcast:overlay.tbd")}
			</span>
		</span>
	);

	return (
		<div className="stack sm">
			<div className={styles.inkTeams}>
				{inkTeam(left)}
				<ActionButton
					schema={broadcastActionSchema}
					action="SET_SWAP_SIDES"
					fields={{ swapSides: !state.swapSides }}
					variant="outlined"
					size="miniscule"
					icon={<ArrowLeftRight />}
					testId="broadcast-swap-sides"
				>
					{t("broadcast:dashboard.sides.swap")}
				</ActionButton>
				{inkTeam(right)}
			</div>
			<div className={styles.inkSwatches}>
				{/* each swatch split the way the game's HUD has it, Alpha's color on the left */}
				{BROADCAST_INK_COLORS.map((color) => (
					<ActionButton
						key={color.key}
						schema={broadcastActionSchema}
						action="SET_INK"
						fields={{ key: color.key, ...gameOnAir }}
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
				<ActionButton
					schema={broadcastActionSchema}
					action="SET_INK"
					fields={gameOnAir}
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
	isTimed,
}: {
	state: CastBroadcastState;
	now: number | null;
	/** Next goes on air by itself once the time runs out. */
	isTimed: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);
	const startedAt = Producer.liveStartedAt(state);
	const endsAt = Producer.liveEndsAt(CAST_PRODUCER_RULES, state);

	if (startedAt === null || endsAt === null || now === null || !isTimed) {
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
	take: { canTake, remainingMs, gameCue },
}: {
	state: CastBroadcastState;
	take: CastTake.TakeStatus;
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

/** The staged items in the order they go on air, as tabs of the scene editor under them editing the one picked. Tabs are dragged to move them in the queue. */
function Queue({
	state,
	selected,
	onSelect,
	isClipOnSources,
}: {
	state: CastBroadcastState;
	selected: CastProducerState;
	onSelect: (itemId: number) => void;
	/** Whether every OBS source has the clip, one going on air without it shows the OBS footage instead. */
	isClipOnSources: (clipId: string) => boolean;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	// shown until the state with the move applied arrives over the stream
	const [move, setMove] = React.useState<{
		state: CastBroadcastState;
		itemId: number;
		toIndex: number;
	} | null>(null);
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const staged = Producer.stagedItems(
		(move?.state === state
			? Producer.moveItem(state, move.itemId, move.toIndex)
			: null) ?? state,
	);

	const handleDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;

		const itemId = Number(active.id);
		const toIndex = staged.findIndex((item) => item.id === over.id);

		setMove({ state, itemId, toIndex });
		submit("MOVE_IN_QUEUE", { itemId, toIndex });
	};

	return (
		<div className={styles.queueBar}>
			<DndContext
				id="broadcast-queue"
				sensors={sensors}
				collisionDetection={closestCenter}
				modifiers={[restrictToHorizontalAxis]}
				onDragEnd={handleDragEnd}
			>
				<SortableContext
					items={staged.map((item) => item.id)}
					strategy={horizontalListSortingStrategy}
				>
					<ol
						className={styles.queue}
						aria-label={t("broadcast:dashboard.queue.header")}
					>
						{staged.map((item, idx) => (
							<QueueTab
								key={item.id}
								state={state}
								item={item}
								before={idx === 0 ? state.live : staged[idx - 1]}
								idx={idx}
								isSelected={item.id === selected.id}
								onSelect={onSelect}
								isClipOnSources={isClipOnSources}
							/>
						))}
					</ol>
				</SortableContext>
			</DndContext>
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
		</div>
	);
}

function QueueTab({
	state,
	item,
	before,
	idx,
	isSelected,
	onSelect,
	isClipOnSources,
}: {
	state: CastBroadcastState;
	item: CastProducerState;
	before: CastProducerState;
	idx: number;
	isSelected: boolean;
	onSelect: (itemId: number) => void;
	/** Whether every OBS source has the clip, one going on air without it shows the OBS footage instead. */
	isClipOnSources: (clipId: string) => boolean;
}) {
	const { t } = useTranslation(["broadcast"]);
	const tournament = useTournament();
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.id });

	const Icon = SCENE_ICONS[item.scene];
	const warning = isItemMissingMatch(state, item)
		? t("broadcast:dashboard.needsMatch")
		: item.scene === "replays" && item.clip && !isClipOnSources(item.clip.id)
			? t("broadcast:dashboard.queue.clipMissing")
			: null;
	const detail = itemDetail(item, {
		clipTitle:
			item.scene === "replays" && item.clip
				? broadcastClipTitle(t, item.clip)
				: undefined,
		teamName:
			item.scene === "team"
				? pickedTeamName({ state, tournament, item })
				: undefined,
	});

	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Translate.toString(transform), transition }}
			className={styles.queueEntry}
			data-dragging={isDragging || undefined}
		>
			<QueueGap before={before} item={item} />
			<div
				ref={isSelected ? scrollIntoQueueView : undefined}
				className={styles.queueItem}
				data-selected={isSelected || undefined}
			>
				<button
					{...(isSelected
						? { ...attributes, ...listeners }
						: // Space and Enter select a tab, picking it up by keyboard is left to the selected one
							R.omit(listeners ?? {}, ["onKeyDown"]))}
					ref={setActivatorNodeRef}
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
					<span className={styles.queueLabel}>
						{t(`broadcast:scene.${item.scene}`)}
					</span>
					{detail ? (
						<span className={clsx(styles.queueLabel, "text-xs text-lighter")}>
							{detail}
						</span>
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
				{isSelected ? (
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
				) : null}
			</div>
		</li>
	);
}

/** Scrolls the queue sideways to show the tab, without moving the page as `scrollIntoView` would. */
function scrollIntoQueueView(tab: HTMLDivElement | null) {
	const queue = tab?.closest("ol");
	if (!tab || !queue) return;

	const tabRect = tab.getBoundingClientRect();
	const queueRect = queue.getBoundingClientRect();

	if (tabRect.left < queueRect.left) {
		queue.scrollLeft -= queueRect.left - tabRect.left;
	} else if (tabRect.right > queueRect.right) {
		queue.scrollLeft += tabRect.right - queueRect.right;
	}
}

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
	const options = Producer.advanceOptions(CAST_PRODUCER_RULES, before, item);
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
	scannerClips,
}: {
	state: CastBroadcastState;
	selected: CastProducerState;
	/** `null` when this browser has no clips the scanner cut for the broadcast. */
	scannerClips: ScannerClip[] | null;
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
				{selected.scene === "bracket" ? (
					<BracketProperties state={state} selected={selected} />
				) : null}
				{selected.scene === "replays" ? (
					<ClipProperty selected={selected} scannerClips={scannerClips} />
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

function BracketProperties({
	state,
	selected,
}: {
	state: CastBroadcastState;
	selected: CastProducerState;
}) {
	const { t } = useTranslation(["broadcast"]);
	const data = useLoaderData<typeof loader>();
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

	const shownIdx = BracketFocus.resolveBracketIdx({
		pickedIdx: selected.bracketIdx,
		featuredMatchBracketIdx:
			state.match?.id === data.featuredMatchId
				? data.featuredMatchBracketIdx
				: null,
		showableIdxs,
	});
	const roundNames =
		shownIdx === null ? undefined : data.eliminationRoundNames[shownIdx];
	const eliminationType =
		shownIdx === null ? null : tournament.bracketsMeta[shownIdx].type;
	const sides: Array<{
		side: BroadcastBracketSide["type"];
		label: string;
	}> =
		eliminationType === "double_elimination"
			? [
					{ side: "winners", label: t("broadcast:dashboard.bracket.winners") },
					{ side: "losers", label: t("broadcast:dashboard.bracket.losers") },
				]
			: [{ side: "winners", label: t("broadcast:dashboard.bracket.rounds") }];

	return (
		<>
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
			{roundNames
				? sides.map(({ side, label }) => (
						<BracketSideProperty
							key={side}
							label={label}
							side={side}
							roundNames={roundNames[side]}
							canHide={
								eliminationType === "double_elimination" &&
								selected.bracketSides[
									side === "winners" ? "losers" : "winners"
								] !== "hidden"
							}
							selected={selected}
						/>
					))
				: null}
		</>
	);
}

function BracketSideProperty({
	label,
	side,
	roundNames,
	canHide,
	selected,
}: {
	label: string;
	side: BroadcastBracketSide["type"];
	/** See `BracketFocus.sideRoundNames`. */
	roundNames: string[];
	canHide: boolean;
	selected: CastProducerState;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	const focus = selected.bracketSides[side];
	const items: Array<{ id: BroadcastBracketSideFocus; name: string }> = [
		...(canHide
			? [
					{
						id: "hidden" as const,
						name: t("broadcast:dashboard.bracket.hidden"),
					},
				]
			: []),
		{ id: "remaining", name: t("broadcast:dashboard.bracket.remaining") },
		{ id: 0, name: t("broadcast:dashboard.bracket.allRounds") },
		...roundNames.slice(1).map((round, roundIdx) => ({
			id: roundIdx + 1,
			name: t("broadcast:dashboard.bracket.fromRound", { round }),
		})),
	];
	const selectedKey =
		typeof focus === "number"
			? Math.min(focus, Math.max(roundNames.length - 1, 0))
			: focus === "hidden" && !canHide
				? "remaining"
				: focus;

	return (
		<Property label={label}>
			<SendouSelect
				aria-label={label}
				items={items}
				selectedKey={selectedKey}
				onSelectionChange={(key) => {
					if (
						typeof key === "number" ||
						key === "hidden" ||
						key === "remaining"
					) {
						submit("SET_BRACKET_SIDE", {
							itemId: selected.id,
							side,
							focus: key,
						});
					}
				}}
				data-testid={`broadcast-bracket-${side}-select`}
			>
				{(item) => (
					<SendouSelectItem key={item.id} id={item.id}>
						{item.name}
					</SendouSelectItem>
				)}
			</SendouSelect>
			{side === "winners" ? (
				<span className="text-xs text-lighter">
					{t("broadcast:dashboard.bracket.explanation")}
				</span>
			) : null}
		</Property>
	);
}

function ClipProperty({
	selected,
	scannerClips,
}: {
	selected: CastProducerState;
	scannerClips: ScannerClip[] | null;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);
	const picked = selected.clip ?? null;

	return (
		<Property label={t("broadcast:dashboard.clips.label")}>
			{scannerClips ? (
				<ClipPicker
					picked={picked}
					clips={scannerClips}
					onPick={(clip) =>
						submit("SET_CLIP", {
							itemId: selected.id,
							clip: clip ?? undefined,
						})
					}
				/>
			) : (
				<>
					<span className="text-sm">
						{picked
							? `${broadcastClipTitle(t, picked)} · ${formatClock(picked.durationMs)}`
							: t("broadcast:dashboard.clips.none")}
					</span>
					<span className="text-xs text-lighter">
						{t("broadcast:dashboard.clips.notScannerBrowser")}
					</span>
				</>
			)}
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
		? matchSides(state.match, "next", state)
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

/** The casters and their VDO.ninja links, saved with the form. Their volume is set in the mixer, see `CasterMixer`. */
function CastersForm({ state }: { state: CastBroadcastState }) {
	return (
		<SendouForm
			schema={broadcastCastersFormSchema}
			defaultValues={{
				casters: state.settings.casters.map((caster) => ({
					userId: caster.userId,
					vdoNinjaUrl: caster.vdoNinjaUrl,
					isAudioOnly: caster.isAudioOnly,
				})),
			}}
			submitButtonSize="small"
			fullWidth
		>
			{({ FormField }) => <FormField name="casters" />}
		</SendouForm>
	);
}

function ObsAudioForm({ obsAudio }: { obsAudio: BroadcastObsAudio | null }) {
	return (
		<SendouForm
			schema={broadcastObsAudioFormSchema}
			defaultValues={{
				inputName: obsAudio?.inputName ?? null,
				port: obsAudio?.port ?? BROADCAST_OBS_WEBSOCKET_DEFAULT_PORT,
				password: obsAudio?.password ?? null,
			}}
			submitButtonSize="small"
			fullWidth
		>
			{({ FormField }) => (
				<>
					<FormField name="port" />
					<FormField name="password" />
					<ObsCaptureCardField />
				</>
			)}
		</SendouForm>
	);
}

function Setup({
	state,
	program,
	statuses,
}: {
	state: CastBroadcastState;
	/** The user's OBS URL for the channel, `null` until generated. */
	program: SerializeFrom<typeof loader>["program"];
	statuses: ClipTransfer.ClipPeerStatus[];
}) {
	const { t } = useTranslation(["broadcast", "common"]);
	const sourceCount = state.health.sources;

	return (
		<div className="stack xl">
			<section className="stack md">
				<div className="stack horizontal sm items-center justify-between flex-wrap">
					<h2 className={styles.panelHeader}>
						{t("broadcast:dashboard.setup.header")}
					</h2>
					<LinkButton
						to={`${BROADCAST_OVERLAYS_DOC_LINK}#setting-up-obs`}
						isExternal
						size="small"
						variant="outlined"
						icon={<SquareArrowOutUpRight />}
					>
						{t("broadcast:dashboard.setup.guide")}
					</LinkButton>
				</div>
				{program ? (
					<div className="stack sm">
						<InviteLinkInput
							label={t("broadcast:dashboard.setup.programLabel")}
							link={`${Config.siteDomain}${broadcastProgramPage(program.programKey)}`}
						/>
						<div className="stack horizontal sm flex-wrap">
							{program.isShowingThis ? null : (
								<ActionButton
									schema={broadcastActionSchema}
									action="POINT_PROGRAM"
									size="small"
									icon={<MonitorUp />}
									confirm={
										program.showing
											? {
													dialogHeading: t(
														"broadcast:dashboard.setup.pointProgramHeading",
														program.showing,
													),
													description: t(
														"broadcast:dashboard.setup.pointProgramDescription",
														program.showing,
													),
													submitButtonText: t(
														"broadcast:dashboard.setup.pointProgram",
													),
												}
											: undefined
									}
									testId="broadcast-point-program-button"
								>
									{t("broadcast:dashboard.setup.pointProgram")}
								</ActionButton>
							)}
							<ActionButton
								schema={broadcastActionSchema}
								action="REGENERATE_PROGRAM_KEY"
								size="small"
								variant="minimal-destructive"
								icon={<RefreshCw />}
								confirm={{
									dialogHeading: t(
										"broadcast:dashboard.setup.regenerateKeyHeading",
									),
									description: t(
										"broadcast:dashboard.setup.regenerateKeyDescription",
									),
									submitButtonText: t(
										"broadcast:dashboard.setup.regenerateKey",
									),
									submitButtonVariant: "destructive",
								}}
								testId="broadcast-regenerate-key-button"
							>
								{t("broadcast:dashboard.setup.regenerateKey")}
							</ActionButton>
						</div>
					</div>
				) : (
					<div className="stack sm items-start">
						<ActionButton
							schema={broadcastActionSchema}
							action="POINT_PROGRAM"
							size="small"
							icon={<KeyRound />}
							testId="broadcast-generate-key-button"
						>
							{t("broadcast:dashboard.setup.generateKey")}
						</ActionButton>
					</div>
				)}
				<ul className={styles.checklist}>
					{program ? (
						<SetupCheck isDone={program.isShowingThis}>
							{program.isShowingThis
								? t("broadcast:dashboard.setup.programShowsThis")
								: program.showing
									? t(
											"broadcast:dashboard.setup.programShowsOther",
											program.showing,
										)
									: t("broadcast:dashboard.setup.programShowsNothing")}
						</SetupCheck>
					) : null}
					<SetupCheck isDone={sourceCount > 0}>
						{sourceCount > 0
							? t("broadcast:dashboard.health.obsConnected")
							: t("broadcast:dashboard.health.obsNotConnected")}
					</SetupCheck>
				</ul>
				<ClipOverlays statuses={statuses} />
				{program ? (
					<div className="stack sm">
						<div className="stack horizontal xs items-center">
							<h3 className="text-sm font-semi-bold">
								{t("broadcast:dashboard.setup.obsAudioHeader")}
							</h3>
							<InfoPopover tiny>
								{t("broadcast:dashboard.setup.obsAudio")}
							</InfoPopover>
						</div>
						<ObsAudioForm obsAudio={program.obsAudio} />
					</div>
				) : null}
			</section>
			<section className="stack md">
				<div className="stack horizontal xs items-center">
					<h2 className={styles.panelHeader}>
						{t("broadcast:dashboard.setup.castersHeader")}
					</h2>
					<InfoPopover tiny>
						{t("broadcast:dashboard.setup.casters")}
					</InfoPopover>
				</div>
				<CastersForm state={state} />
			</section>
			<section className="stack md">
				<div className="stack horizontal sm items-center justify-between flex-wrap">
					<h2 className={styles.panelHeader}>
						{t("broadcast:dashboard.setup.scannerHeader")}
					</h2>
					<LinkButton
						to={SCANNER_PAGE}
						size="small"
						variant="outlined"
						icon={<ScanEye />}
					>
						{t("broadcast:dashboard.setup.openScanner")}
					</LinkButton>
				</div>
				<ul className={styles.checklist}>
					<SetupCheck isDone={state.health.scanners > 0}>
						{state.health.scanners > 0
							? t("broadcast:dashboard.health.scannerConnected")
							: t("broadcast:dashboard.health.noScanner")}
					</SetupCheck>
				</ul>
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
						{status.receivedClipIds !== null && status.clipCount > 0 ? (
							<>
								{" "}
								·{" "}
								{!hasEveryClip(status)
									? t("broadcast:dashboard.clips.progress", {
											received: status.receivedClipIds.length,
											total: status.clipCount,
										})
									: status.transferMs !== null
										? t("broadcast:dashboard.clips.lastTransfer", {
												seconds: (status.transferMs / 1000).toFixed(1),
											})
										: t("broadcast:dashboard.clips.upToDate")}
							</>
						) : null}
					</span>
				))
			)}
		</div>
	);
}

/** What theme the overlays wear, its CSS and weapon images being set in the designer. */
function Theme({
	state,
	designUrl,
}: {
	state: CastBroadcastState;
	designUrl: string;
}) {
	const { t } = useTranslation(["broadcast", "forms"]);
	const data = useLoaderData<typeof loader>();
	const { css, weaponImages } = state.settings;
	const presetKey = data.themePresetKey;

	return (
		<div className="stack md items-start">
			<div className="stack xs">
				<span className="text-sm font-semi-bold">
					{!css
						? t("broadcast:dashboard.theme.none")
						: presetKey
							? t(`broadcast:design.preset.${presetKey}`)
							: t("broadcast:dashboard.theme.own")}
				</span>
				<span className="text-xs text-lighter">
					{!css
						? t("broadcast:dashboard.theme.noneHint")
						: presetKey
							? t("broadcast:dashboard.theme.presetHint")
							: t("broadcast:dashboard.theme.ownHint")}
				</span>
				<span className="text-xs text-lighter">
					{t("forms:labels.broadcastWeaponImages")}:{" "}
					{t(`forms:options.broadcastWeaponImages.${weaponImages}`)}
				</span>
			</div>
			<LinkButton to={designUrl} size="small" icon={<Brush />}>
				{t("broadcast:dashboard.theme.design")}
			</LinkButton>
		</div>
	);
}

/** Whether every OBS source has the clip. */
function isOnEverySource(
	statuses: ClipTransfer.ClipPeerStatus[],
	clipId: string,
) {
	return statuses
		.filter((status) => status.peer.role === "source")
		.every((status) => status.receivedClipIds?.includes(clipId));
}

function hasEveryClip(status: ClipTransfer.ClipPeerStatus) {
	return status.receivedClipIds?.length === status.clipCount;
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

	return matchSides(state.match, "next", state)[
		item.teamPick === "left" ? 0 : 1
	].team?.name;
}

/** Clip or team and length of a staged item, e.g. "Triple splat · 0:25". */
function itemDetail(
	item: CastProducerState,
	{ clipTitle, teamName }: { clipTitle?: string; teamName?: string },
) {
	const length = Producer.lengthMs(CAST_PRODUCER_RULES, item);

	return [clipTitle, teamName, length !== null ? formatClock(length) : null]
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
