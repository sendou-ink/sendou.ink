import type * as React from "react";
import { useTranslation } from "react-i18next";
import { groupNumberToLetters } from "~/features/tournament-bracket/tournament-bracket-utils";
import { useCamera } from "../broadcast-hooks";
import type {
	BroadcastBracket,
	BroadcastBracketMatch,
	BroadcastBracketRound,
	BroadcastBracketSide,
	BroadcastRoundRobinBracket,
	BroadcastState,
	BroadcastSwissBracket,
	BroadcastView,
	ProducerState,
} from "../broadcast-types";
import { combineStyles, scenePart } from "../broadcast-utils";
import layout from "./BracketScene.layout.module.css";
import look from "./BracketScene.module.css";
import { HoldScene } from "./HoldScene";
import { SceneBackdrop } from "./SceneBackdrop";
import { TeamLogo } from "./TeamLogo";

const styles = combineStyles(look, layout);

const part = scenePart("bracket");

const SWISS_MIN_COLUMNS = 3;
const SWISS_MAX_COLUMNS = 6;
const SWISS_MAX_ROWS = 8;

/**
 * Full screen of a double elimination bracket, the part of it the producer focused on: by default the rounds
 * still being played. Or of a round robin or Swiss group: its standings next to its rounds (Swiss: the round being
 * played, its matches pooled by the teams' records). Scaled to fill the screen along
 * with its header, then zoomed in on the featured match (and its teams' standings) after a moment, leaving the
 * header out of view.
 */
export function BracketScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const { t } = useTranslation(["broadcast"]);
	const bracket = state.bracket[view];
	const cameraRef = useCamera<HTMLDivElement>({
		content: bracket,
		zoomTarget: "[data-featured]",
		zoomedOut: "header",
	});

	if (!bracket || isEmpty(bracket)) {
		return <HoldScene scene="bracket" state={state} view={view} />;
	}

	return (
		<div className={styles.bracket}>
			<SceneBackdrop />
			<div className={styles.stage}>
				<div ref={cameraRef} className={styles.camera}>
					<header className={styles.header} {...part("header")}>
						<img
							className={styles.tournamentLogo}
							src={state.tournament.logoUrl}
							alt=""
							{...part("tournament-logo")}
						/>
						<div className={styles.headerText}>
							<div
								className={styles.tournamentName}
								{...part("tournament-name")}
							>
								{state.tournament.name}
							</div>
							<h1 className={styles.bracketName} {...part("bracket-name")}>
								{bracket.name}
								{bracket.type !== "elimination" &&
								typeof bracket.groupNumber === "number" ? (
									<span className={styles.groupName} {...part("group-name")}>
										{t("broadcast:overlay.group", {
											group: groupNumberToLetters(bracket.groupNumber),
										})}
									</span>
								) : null}
							</h1>
						</div>
					</header>
					{bracket.type === "round_robin" || bracket.type === "swiss" ? (
						<Group group={bracket} producer={state[view]} />
					) : (
						<div className={styles.sides}>
							{bracket.sides.map((side) => (
								<Side key={side.type} side={side} producer={state[view]} />
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

function Side({
	side,
	producer,
}: {
	side: BroadcastBracketSide;
	producer: Pick<ProducerState, "swapSides">;
}) {
	return (
		<section
			className={styles.side}
			data-side={side.type}
			style={{ "--slots": side.slotCount } as React.CSSProperties}
			{...part("side")}
		>
			{side.rounds.map((round) => (
				<Round key={round.id} round={round} producer={producer} />
			))}
		</section>
	);
}

function Round({
	round,
	producer,
}: {
	round: BroadcastBracketRound;
	producer: Pick<ProducerState, "swapSides">;
}) {
	return (
		<div
			className={styles.round}
			data-connector={round.connector ?? undefined}
			{...part("round")}
		>
			<div className={styles.roundName} {...part("round-name")}>
				{round.name}
			</div>
			<ol className={styles.slots}>
				{round.matches.map((match, matchIdx) => (
					<li
						key={match?.id ?? `bye-${matchIdx}`}
						className={styles.slot}
						data-bye={match ? undefined : true}
						data-fed={match?.isFed || undefined}
					>
						{match ? <Match match={match} producer={producer} /> : null}
					</li>
				))}
			</ol>
		</div>
	);
}

function Group({
	group,
	producer,
}: {
	group: BroadcastRoundRobinBracket | BroadcastSwissBracket;
	producer: Pick<ProducerState, "swapSides">;
}) {
	const { t } = useTranslation(["broadcast"]);
	const matches =
		group.type === "swiss"
			? group.pools.flatMap((pool) => pool.matches)
			: group.rounds.flatMap((round) => round.matches);
	const featuredMatch = matches.find((match) => match.isFeatured);

	return (
		<div className={styles.group}>
			<section className={styles.standings} {...part("standings")}>
				<div className={styles.standingsHeader}>
					<span className={styles.standingSets}>
						{t("broadcast:overlay.sets")}
					</span>
					<span className={styles.standingMaps}>
						{t("broadcast:overlay.maps")}
					</span>
				</div>
				{group.standings.map((run, runIdx) => (
					<ol
						key={run.standings[0]?.team.id ?? runIdx}
						className={styles.standingsList}
						data-cut-above={run.hiddenAbove > 0 || undefined}
						data-cut-below={
							runIdx < group.standings.length - 1 ||
							group.standingsHiddenBelow > 0 ||
							undefined
						}
					>
						{run.standings.map((standing) => {
							const featuredIndex =
								featuredMatch?.teams.findIndex(
									(team) => team?.id === standing.team.id,
								) ?? -1;

							return (
								<li
									key={standing.team.id}
									className={styles.standing}
									data-featured={featuredIndex !== -1 || undefined}
									data-team={
										featuredIndex === -1
											? undefined
											: featuredSide(featuredIndex as 0 | 1, producer)
									}
									{...part("standing")}
								>
									<span
										className={styles.placement}
										{...part("standing-placement")}
									>
										{standing.placement}
									</span>
									<TeamLogo
										team={standing.team}
										className={styles.standingLogo}
										{...part("team-logo")}
									/>
									{typeof standing.team.seed === "number" ? (
										<span className={styles.seed} {...part("team-seed")}>
											{standing.team.seed}
										</span>
									) : null}
									<span className={styles.standingName} {...part("team-name")}>
										{standing.team.name}
									</span>
									<span
										className={styles.standingSets}
										{...part("standing-sets")}
									>
										{standing.setWins}–{standing.setLosses}
									</span>
									<span
										className={styles.standingMaps}
										{...part("standing-maps")}
									>
										{standing.mapWins}–{standing.mapLosses}
									</span>
								</li>
							);
						})}
					</ol>
				))}
			</section>
			{group.type === "swiss" ? (
				<SwissRound group={group} producer={producer} />
			) : (
				<section className={styles.groupRounds}>
					{group.rounds.map((round) => (
						<GroupRow
							key={round.id}
							name={t("broadcast:overlay.round", { number: round.number })}
							matches={round.matches}
							producer={producer}
						/>
					))}
				</section>
			)}
		</div>
	);
}

function SwissRound({
	group,
	producer,
}: {
	group: BroadcastSwissBracket;
	producer: Pick<ProducerState, "swapSides">;
}) {
	const { t } = useTranslation(["broadcast"]);
	const columns = swissColumnCount(group);

	return (
		<section
			className={styles.groupRounds}
			data-pools
			style={{ "--columns": columns } as React.CSSProperties}
		>
			{group.roundNumber !== null ? (
				<div className={styles.swissRoundName} {...part("swiss-round")}>
					{t("broadcast:overlay.roundOf", {
						number: group.roundNumber,
						count: group.roundCount,
					})}
				</div>
			) : null}
			{group.pools.map((pool) => (
				<GroupRow
					key={`${pool.wins}-${pool.losses}`}
					name={`${pool.wins}–${pool.losses}`}
					matches={pool.matches}
					producer={producer}
				/>
			))}
		</section>
	);
}

/** Matches of a round robin round or of a Swiss round's record pool, under its name. */
function GroupRow({
	name,
	matches,
	producer,
}: {
	name: string;
	matches: BroadcastBracketMatch[];
	producer: Pick<ProducerState, "swapSides">;
}) {
	return (
		<div className={styles.groupRound} {...part("round")}>
			<div className={styles.roundName} {...part("round-name")}>
				{name}
			</div>
			<ol className={styles.groupMatches}>
				{matches.map((match) => (
					<li key={match.id}>
						<Match match={match} producer={producer} />
					</li>
				))}
			</ol>
		</div>
	);
}

function Match({
	match,
	producer,
}: {
	match: BroadcastBracketMatch;
	producer: Pick<ProducerState, "swapSides">;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div
			className={styles.match}
			data-status={matchStatus(match)}
			data-featured={match.isFeatured || undefined}
			{...part("match")}
		>
			{([0, 1] as const).map((index) => {
				const team = match.teams[index];

				return (
					<div
						key={index}
						className={styles.team}
						data-result={
							match.winner === null
								? undefined
								: match.winner === index
									? "win"
									: "loss"
						}
						// the featured match's teams in the colors of their sides on the other scenes
						data-team={
							match.isFeatured ? featuredSide(index, producer) : undefined
						}
						data-tbd={team ? undefined : true}
						{...part("team")}
					>
						{team ? (
							<TeamLogo
								team={team}
								className={styles.logo}
								{...part("team-logo")}
							/>
						) : (
							<span className={styles.logo} />
						)}
						{typeof team?.seed === "number" ? (
							<span className={styles.seed} {...part("team-seed")}>
								{team.seed}
							</span>
						) : null}
						<span className={styles.name} {...part("team-name")}>
							{team?.name ?? t("broadcast:overlay.tbd")}
						</span>
						<span className={styles.score} {...part("team-score")}>
							{match.scores?.[index]}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function matchStatus(match: BroadcastBracketMatch) {
	if (match.winner !== null) return "over";
	if (match.scores) return "ongoing";
	if (match.teams[0] && match.teams[1]) return "ready";

	return "waiting";
}

function featuredSide(
	index: 0 | 1,
	producer: Pick<ProducerState, "swapSides">,
): "a" | "b" {
	return (index === 0) !== producer.swapSides ? "a" : "b";
}

function isEmpty(bracket: BroadcastBracket) {
	switch (bracket.type) {
		case "round_robin":
			return bracket.rounds.length === 0;
		case "swiss":
			return bracket.standings.every((run) => run.standings.length === 0);
		default:
			return bracket.sides.length === 0;
	}
}

/** Fewest matches side by side that keep a Swiss round's pools from stacking too tall. */
function swissColumnCount(group: BroadcastSwissBracket) {
	for (
		let columns = SWISS_MIN_COLUMNS;
		columns < SWISS_MAX_COLUMNS;
		columns++
	) {
		const rows = group.pools.reduce(
			(sum, pool) => sum + Math.ceil(pool.matches.length / columns),
			0,
		);
		if (rows <= SWISS_MAX_ROWS) return columns;
	}

	return SWISS_MAX_COLUMNS;
}
