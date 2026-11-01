import clsx from "clsx";
import {
	ArrowLeftRight,
	ChevronsLeft,
	Clapperboard,
	Clock,
	Coffee,
	Flag,
	Gamepad2,
	type LucideIcon,
	Map as MapIcon,
	Mic,
	Play,
	TriangleAlert,
	Trophy,
	Users,
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
import type { SendouRouteHandle } from "~/utils/remix.server";
import { tournamentMatchPage } from "~/utils/urls";
import {
	BROADCAST_HOLD_SCENES,
	BROADCAST_INK_COLORS,
	BROADCAST_KEYFRAMES,
	BROADCAST_REHEARSE_MESSAGE,
	BROADCAST_SCENE_PARTS,
	BROADCAST_SCENES,
	BROADCAST_THEME_TOKENS,
	BROADCAST_TRANSITIONS,
} from "../broadcast-constants";
import { useBroadcastStream } from "../broadcast-hooks";
import {
	broadcastActionSchema,
	broadcastInfoFormSchema,
	broadcastThemeFormSchema,
} from "../broadcast-schemas";
import type {
	BroadcastScene,
	BroadcastState,
	BroadcastView,
} from "../broadcast-types";
import { broadcastOverlayPage, broadcastStreamUrl } from "../broadcast-urls";
import { inkColorVars, matchSides, roundLabel } from "../broadcast-utils";
import { BroadcastPreview } from "../components/BroadcastPreview";
import { loader } from "../loaders/to.$id.broadcast.$channel.server";
import styles from "./to.$id.broadcast.$channel.module.css";

export { action } from "../actions/to.$id.broadcast.$channel.server";
export { loader };

export const handle: SendouRouteHandle = {
	i18n: ["broadcast"],
};

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
	const { state, isConnected } = useBroadcastStream({
		url: broadcastStreamUrl({ ...pageArgs, role: "dashboard" }),
		initialState: data.state,
	});
	const nextPreviewRef = React.useRef<HTMLIFrameElement>(null);
	useRevalidateOnFeaturedMatchChange(state.match?.id ?? null);

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
				<section className="stack sm">
					<ViewHeader view="live" state={state} />
					<BroadcastPreview
						src={broadcastOverlayPage({
							...pageArgs,
							view: "live",
							preview: true,
						})}
						title={t("broadcast:dashboard.live")}
					/>
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
					<TransitionBus state={state} onRehearse={rehearse} />
				</div>

				<section className="stack sm">
					<ViewHeader view="next" state={state} />
					<BroadcastPreview
						iframeRef={nextPreviewRef}
						src={broadcastOverlayPage({
							...pageArgs,
							view: "next",
							preview: true,
						})}
						title={t("broadcast:dashboard.next")}
					/>
				</section>
			</div>

			<SceneTiles state={state} />

			<Teams state={state} />

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
	state,
	onRehearse,
}: {
	state: BroadcastState;
	onRehearse: () => void;
}) {
	const { t } = useTranslation(["broadcast"]);
	const { submit } = useActionSubmit(broadcastActionSchema);

	return (
		<div className={styles.transitionBus}>
			<div className={styles.busLabel}>
				{t("broadcast:dashboard.transition")}
			</div>
			<SendouChipRadioGroup
				orientation="vertical"
				className={styles.transitions}
				aria-label={t("broadcast:dashboard.transition")}
			>
				{BROADCAST_TRANSITIONS.map((transition) => (
					<SendouChipRadio
						key={transition}
						name="broadcast-transition"
						value={transition}
						checked={state.next.transition === transition}
						onChange={() => submit("SET_NEXT_TRANSITION", { transition })}
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

function SceneTiles({ state }: { state: BroadcastState }) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div className={styles.scenes}>
			{BROADCAST_SCENES.map((scene) => {
				const Icon = SCENE_ICONS[scene];

				return (
					<ActionButton
						key={scene}
						schema={broadcastActionSchema}
						action="SET_NEXT_SCENE"
						fields={{ scene }}
						className={clsx(styles.sceneTile, {
							[styles.sceneTileNext]: state.next.scene === scene,
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
	);
}

function Teams({ state }: { state: BroadcastState }) {
	const { t } = useTranslation(["broadcast"]);

	if (!state.match) return null;

	return (
		<SendouSection title={t("broadcast:dashboard.teams.header")}>
			<div className="stack md">
				<ActionButton
					schema={broadcastActionSchema}
					action="SET_NEXT_SWAP_SIDES"
					fields={{ swapSides: !state.next.swapSides }}
					variant={state.next.swapSides ? "primary" : "outlined"}
					size="small"
					icon={<ArrowLeftRight />}
					formClassName="self-start"
				>
					{t("broadcast:dashboard.swapSides")}
				</ActionButton>
				<InkColors state={state} />
			</div>
		</SendouSection>
	);
}

function InkColors({ state }: { state: BroadcastState }) {
	const { t } = useTranslation(["broadcast"]);
	const ink = state.next.ink;
	const colors = inkColorVars(state.next);
	const sides = state.match
		? matchSides(state.match, "next", state.next)
		: null;

	return (
		<div className="stack sm">
			<div className="stack horizontal sm items-center justify-between flex-wrap">
				<span className="text-sm font-semi-bold">
					{t("broadcast:dashboard.ink.header")}
				</span>
				<div className="stack horizontal sm">
					<ActionButton
						schema={broadcastActionSchema}
						action="SET_NEXT_INK"
						fields={{ isFlipped: false }}
						variant={ink ? "minimal" : "primary"}
						size="small"
					>
						{t("broadcast:dashboard.ink.theme")}
					</ActionButton>
					{ink ? (
						<ActionButton
							schema={broadcastActionSchema}
							action="SET_NEXT_INK"
							fields={{ key: ink.key, isFlipped: !ink.isFlipped }}
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
			<div className={styles.inkSwatches}>
				{BROADCAST_INK_COLORS.map((color) => (
					<ActionButton
						key={color.key}
						schema={broadcastActionSchema}
						action="SET_NEXT_INK"
						fields={{ key: color.key, isFlipped: ink?.isFlipped ?? false }}
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
			{ink && sides ? (
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
}: {
	view: BroadcastView;
	state: BroadcastState;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<h2 className={styles.viewHeader} data-view={view}>
			{t(`broadcast:dashboard.${view}`)} ·{" "}
			{t(`broadcast:scene.${state[view].scene}`)}
		</h2>
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
