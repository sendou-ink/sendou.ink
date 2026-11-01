import clsx from "clsx";
import {
	ArrowLeftRight,
	Cable,
	ChevronDown,
	ChevronsLeft,
	ChevronUp,
	CircleCheck,
	CircleDashed,
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
	Palette,
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
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { InviteLinkInput } from "~/components/InviteLinkInput";
import { Config } from "~/config";
import { useTournament } from "~/features/tournament/tournament-context";
import { SendouForm } from "~/form/SendouForm";
import { useActionSubmit } from "~/hooks/useActionSubmit";
import { useLatestRef } from "~/hooks/useLatestRef";
import { useSearchParam } from "~/modules/search-params/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { tournamentMatchPage } from "~/utils/urls";
import {
	BROADCAST_BRACKET_FOCUSES,
	BROADCAST_DASHBOARD_TABS,
	BROADCAST_HOLD_SCENES,
	BROADCAST_INK_COLORS,
	BROADCAST_KEYFRAMES,
	BROADCAST_PROTOTYPE_CLIPS,
	BROADCAST_REHEARSE_MESSAGE,
	BROADCAST_SCENE_DURATIONS_MS,
	BROADCAST_SCENE_GROUPS,
	BROADCAST_SCENE_PARTS,
	BROADCAST_THEME_TOKENS,
	BROADCAST_TRANSITIONS,
} from "../broadcast-constants";
import {
	useBroadcastStream,
	useClipSender,
	useServerNow,
} from "../broadcast-hooks";
import {
	broadcastActionSchema,
	broadcastCastersFormSchema,
	broadcastHeadlineFormSchema,
	broadcastThemeFormSchema,
} from "../broadcast-schemas";
import { broadcastDashboardSearchParams } from "../broadcast-search-params";
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
	formatClock,
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

/** Number keys 1–9 and 0 pick these, in this order. */
const SCENES_BY_HOTKEY: BroadcastScene[] = BROADCAST_SCENE_GROUPS.flatMap(
	(group) => group.scenes,
);

type DashboardTab = (typeof BROADCAST_DASHBOARD_TABS)[number];

const TAB_ICONS: Record<DashboardTab, LucideIcon> = {
	scene: Clapperboard,
	setup: Cable,
	theme: Palette,
};

/**
 * Control panel of one broadcast: the live and the staged ("next") overlay side by side, Take puts next on air.
 * Under them the tabs edit the selected staged item's scene, set up OBS and the show, and theme the overlays.
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
	const areClipsOnSources = everySourceHasClips(clipSender.statuses);
	useSceneHotkeys(selected);

	const rehearse = () =>
		nextPreviewRef.current?.contentWindow?.postMessage(
			BROADCAST_REHEARSE_MESSAGE,
			window.location.origin,
		);

	const selectItem = (itemId: number) => {
		setSelectedItemId(itemId);
		setTab("scene");
	};

	return (
		<div className={clsx("stack lg", styles.dashboard)}>
			<header className="stack sm">
				<div className="stack horizontal sm items-center justify-between flex-wrap">
					<h1 className="text-lg">
						{t("broadcast:title")} · {data.channel.name}
					</h1>
					<Health
						state={state}
						isConnected={isConnected}
						onClick={() => setTab("setup")}
					/>
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
						onSelect={selectItem}
						areClipsOnSources={areClipsOnSources}
					/>
				</section>
			</div>

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
				<SendouTabPanel id="scene">
					<SceneInspector
						state={state}
						selected={selected}
						selectedLabel={selectedLabel}
					/>
				</SendouTabPanel>
				<SendouTabPanel id="setup">
					<Setup
						state={state}
						programUrl={`${Config.siteDomain}${broadcastOverlayPage(pageArgs)}`}
						statuses={clipSender.statuses}
						areClipsOnSources={areClipsOnSources}
					/>
				</SendouTabPanel>
				<SendouTabPanel id="theme">
					<Theme state={state} />
				</SendouTabPanel>
			</SendouTabs>
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

/** The number keys pick the selected item's scene. */
function useSceneHotkeys(selected: ProducerState) {
	const { submit } = useActionSubmit(broadcastActionSchema);
	const latest = useLatestRef({ selected, submit });

	React.useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (!isShortcut(event) || !/^\d$/.test(event.key)) return;
			const current = latest.current;

			// 1 is the first scene, 0 the tenth
			const scene = SCENES_BY_HOTKEY[(Number(event.key) + 9) % 10];
			if (!scene || scene === current.selected.scene) return;

			current.submit("SET_SCENE", { itemId: current.selected.id, scene });
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [latest]);
}

/** A key press without modifiers that isn't typing into a field or meant for an open popover or dialog. */
function isShortcut(event: KeyboardEvent) {
	if (
		event.repeat ||
		event.ctrlKey ||
		event.metaKey ||
		event.altKey ||
		event.shiftKey
	) {
		return false;
	}

	const target = event.target;
	if (!(target instanceof HTMLElement)) return true;

	const isTyping =
		target.isContentEditable ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLInputElement &&
			!["radio", "checkbox", "button", "submit"].includes(target.type));

	return !isTyping && !target.closest("[popover], dialog");
}

function Keycap({ children }: { children: React.ReactNode }) {
	return (
		<kbd className={styles.keycap} aria-hidden>
			{children}
		</kbd>
	);
}

function Health({
	state,
	isConnected,
	onClick,
}: {
	state: BroadcastState;
	isConnected: boolean;
	onClick: () => void;
}) {
	const { t } = useTranslation(["broadcast"]);

	const status = !isConnected
		? "warning"
		: state.health.sources > 0
			? "success"
			: "info";

	return (
		<button
			type="button"
			className={styles.health}
			data-status={status}
			onClick={onClick}
		>
			{status === "success" ? (
				<CircleCheck size={16} />
			) : (
				<TriangleAlert size={16} />
			)}
			{isConnected
				? t("broadcast:dashboard.health.sources", {
						count: state.health.sources,
					})
				: t("broadcast:dashboard.health.disconnected")}
		</button>
	);
}

function FeaturedMatch({ state }: { state: BroadcastState }) {
	const { t } = useTranslation(["broadcast", "tournament"]);
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

/** Changes to what is on air that apply right away, without a Take. */
function OnAirControls({ state }: { state: BroadcastState }) {
	if (!state.match) return null;

	return (
		<div className={styles.onAir}>
			<InkColors state={state} match={state.match} />
			<ResultsNotOnAir match={state.match} />
		</div>
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

/** The staged items in the order they go on air, the one picked being edited by the scene tab. */
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

/** The selected staged item: its scene and only the settings that scene uses. */
function SceneInspector({
	state,
	selected,
	selectedLabel,
}: {
	state: BroadcastState;
	selected: ProducerState;
	selectedLabel: string;
}) {
	const { t } = useTranslation(["broadcast"]);
	const isHoldScene = (BROADCAST_HOLD_SCENES as readonly string[]).includes(
		selected.scene,
	);

	return (
		<div className="stack lg">
			<h2 className={styles.inspectorHeader}>
				{t("broadcast:dashboard.editing", {
					item: selectedLabel,
					scene: t(`broadcast:scene.${selected.scene}`),
				})}
			</h2>
			<ScenePicker state={state} selected={selected} />
			<div className={styles.properties}>
				{state.match ? (
					<SwapSides match={state.match} selected={selected} />
				) : null}
				{selected.scene === "bracket" ? (
					<BracketProperties selected={selected} />
				) : null}
				{selected.scene === "replays" ? (
					<ClipProperty selected={selected} />
				) : null}
				<DurationProperty selected={selected} />
			</div>
			{isHoldScene ? <HeadlineForm headline={state.settings.headline} /> : null}
			{selected.scene === "casters" ? (
				<CastersForm casterIds={state.settings.casterIds} />
			) : null}
		</div>
	);
}

function ScenePicker({
	state,
	selected,
}: {
	state: BroadcastState;
	selected: ProducerState;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className={styles.sceneGroups}>
			{BROADCAST_SCENE_GROUPS.map((group) => (
				<fieldset key={group.key} className={styles.sceneGroup}>
					<legend className={styles.sceneGroupLabel}>
						{t(`broadcast:dashboard.sceneGroup.${group.key}`)}
					</legend>
					<div className={styles.scenes}>
						{group.scenes.map((scene) => {
							const Icon = SCENE_ICONS[scene];
							const hotkey = (SCENES_BY_HOTKEY.indexOf(scene) + 1) % 10;

							return (
								<ActionButton
									key={scene}
									schema={broadcastActionSchema}
									action="SET_SCENE"
									fields={{ itemId: selected.id, scene }}
									className={clsx(styles.sceneTile, {
										[styles.sceneTileSelected]: selected.scene === scene,
									})}
									formClassName={styles.sceneForm}
									testId={`broadcast-scene-${scene}`}
								>
									{state.live.scene === scene ? (
										<span className={styles.liveBadge}>
											{t("broadcast:dashboard.live")}
										</span>
									) : null}
									<Keycap>{hotkey}</Keycap>
									<Icon className={styles.sceneIcon} />
									{t(`broadcast:scene.${scene}`)}
								</ActionButton>
							);
						})}
					</div>
				</fieldset>
			))}
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

function SwapSides({
	match,
	selected,
}: {
	match: BroadcastMatch;
	selected: ProducerState;
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

function BracketProperties({ selected }: { selected: ProducerState }) {
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

	return (
		<>
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

function ClipProperty({ selected }: { selected: ProducerState }) {
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

function DurationProperty({ selected }: { selected: ProducerState }) {
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
			submitButtonSize="small"
			fullWidth
		>
			{({ FormField }) => <FormField name="casterIds" />}
		</SendouForm>
	);
}

function Setup({
	state,
	programUrl,
	statuses,
	areClipsOnSources,
}: {
	state: BroadcastState;
	programUrl: string;
	statuses: ClipTransfer.ClipPeerStatus[];
	areClipsOnSources: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);
	const sourceCount = state.health.sources;

	return (
		<div className="stack xl">
			<section className="stack md">
				<h2 className={styles.panelHeader}>
					{t("broadcast:dashboard.setup.header")}
				</h2>
				<p className="text-sm text-lighter">
					{t("broadcast:dashboard.setup.program")}
				</p>
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
					{t("broadcast:dashboard.info.header")}
				</h2>
				<CastersForm casterIds={state.settings.casterIds} />
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

	return (
		<div className="stack xs text-sm">
			<span className="font-semi-bold">
				{t("broadcast:dashboard.clips.overlays")}
			</span>
			<span className="text-xs text-lighter">
				{t("broadcast:dashboard.clips.transfer")}
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
	);
}

function Theme({ state }: { state: BroadcastState }) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className="stack lg">
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
			<details className={styles.reference}>
				<summary className="text-sm font-semi-bold">
					{t("broadcast:dashboard.theme.reference")}
				</summary>
				<ThemeReference />
			</details>
		</div>
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
	if (design === "stinger" || design === "matchup" || design === "ticker") {
		return `[data-part="${design}"]`;
	}
	if (design === "hold") {
		return BROADCAST_HOLD_SCENES.map((scene) => `[data-scene="${scene}"]`).join(
			", ",
		);
	}

	return `[data-scene="${design}"]`;
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
