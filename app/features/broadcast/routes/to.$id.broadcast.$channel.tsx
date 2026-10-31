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
	RotateCcw,
	TriangleAlert,
	Trophy,
	Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import * as R from "remeda";
import { ActionButton } from "~/components/ActionButton";
import { Alert } from "~/components/Alert";
import { SendouSection } from "~/components/elements/Section";
import { InviteLinkInput } from "~/components/InviteLinkInput";
import { Config } from "~/config";
import { useTournament } from "~/features/tournament/tournament-context";
import { SendouForm } from "~/form/SendouForm";
import type { SendouRouteHandle } from "~/utils/remix.server";
import {
	BROADCAST_SCENE_PARTS,
	BROADCAST_SCENES,
	BROADCAST_THEME_TOKENS,
} from "../broadcast-constants";
import { useBroadcastStream } from "../broadcast-hooks";
import {
	broadcastActionSchema,
	broadcastTeamFormSchema,
	broadcastThemeFormSchema,
} from "../broadcast-schemas";
import type {
	BroadcastScene,
	BroadcastState,
	BroadcastTeam,
	BroadcastView,
} from "../broadcast-types";
import { broadcastOverlayPage, broadcastStreamUrl } from "../broadcast-urls";
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

	return (
		<div className={clsx("stack lg", styles.dashboard)}>
			<header className="stack sm">
				<h1 className="text-lg">
					{t("broadcast:title")} · {data.channel.name}
				</h1>
				<Health state={state} isConnected={isConnected} />
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

				<section className="stack sm">
					<ViewHeader view="next" state={state} />
					<BroadcastPreview
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

			<SendouSection title={t("broadcast:dashboard.theme.header")}>
				<div className="stack md">
					<SendouForm
						schema={broadcastThemeFormSchema}
						defaultValues={{ css: state.settings.css || null }}
					>
						{({ FormField }) => <FormField name="css" />}
					</SendouForm>
					<ThemeReference />
				</div>
			</SendouSection>
		</div>
	);
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
	const { t } = useTranslation(["broadcast"]);

	if (!state.match) {
		return (
			<Alert variation="WARNING" alertClassName={styles.health}>
				{t("broadcast:dashboard.noFeaturedMatch")}
			</Alert>
		);
	}

	const [teamOne, teamTwo] = state.match.teams;
	const progress = state.match.progress.next;

	return (
		<div className="text-sm">
			<span className="text-lighter">
				{t("broadcast:dashboard.featuredMatch")}:
			</span>{" "}
			<span className="font-semi-bold">
				{teamOne?.name ?? t("broadcast:overlay.tbd")} {progress.scores[0]}–
				{progress.scores[1]} {teamTwo?.name ?? t("broadcast:overlay.tbd")}
			</span>{" "}
			<span className="text-lighter">
				{[state.match.bracketName, state.match.roundName]
					.filter(Boolean)
					.join(" · ")}
			</span>
			{progress.isOver ? (
				<span className="text-warning">
					{" "}
					· {t("broadcast:dashboard.setFinished")}
				</span>
			) : null}
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
				<div className="stack horizontal md items-center justify-between flex-wrap">
					<p className="text-sm text-lighter">
						{t("broadcast:dashboard.teams.description")}
					</p>
					<ActionButton
						schema={broadcastActionSchema}
						action="SET_NEXT_SWAP_SIDES"
						fields={{ swapSides: !state.next.swapSides }}
						variant={state.next.swapSides ? "primary" : "outlined"}
						size="small"
						icon={<ArrowLeftRight />}
					>
						{t("broadcast:dashboard.swapSides")}
					</ActionButton>
				</div>
				<div className={styles.teams}>
					{state.match.teams.map((team, i) =>
						team ? <TeamEditor key={team.id} team={team} /> : <div key={i} />,
					)}
				</div>
			</div>
		</SendouSection>
	);
}

function TeamEditor({ team }: { team: BroadcastTeam }) {
	const { t } = useTranslation(["broadcast"]);
	const defaultValues = {
		teamId: team.id,
		name: team.name,
		players: team.players.map((player) => ({
			userId: player.userId,
			name: player.name,
			weapons: player.weapons.map((id) => ({ id, isFavorite: false })),
		})),
	};

	return (
		<div className="stack md">
			{team.isEdited ? (
				<ActionButton
					schema={broadcastActionSchema}
					action="RESET_TEAM"
					fields={{ teamId: team.id }}
					variant="minimal"
					size="small"
					icon={<RotateCcw />}
					formClassName="self-start"
				>
					{t("broadcast:dashboard.teams.reset")}
				</ActionButton>
			) : null}
			<SendouForm
				// remounts with the saved values, e.g. after another producer's edit
				key={JSON.stringify(defaultValues)}
				schema={broadcastTeamFormSchema}
				defaultValues={defaultValues}
			>
				{({ FormField }) => (
					<>
						<FormField name="name" />
						<FormField name="players" canRemoveItem={() => false} />
					</>
				)}
			</SendouForm>
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
			{R.keys(BROADCAST_SCENE_PARTS).map((scene) => (
				<div key={scene}>
					<span className="font-semi-bold">
						{t("broadcast:dashboard.theme.parts")} (
						<code>[data-scene="{scene}"]</code>):
					</span>{" "}
					<code>{BROADCAST_SCENE_PARTS[scene].join(", ")}</code>
				</div>
			))}
		</div>
	);
}
