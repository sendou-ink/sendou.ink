import type * as React from "react";
import { useEffect, useEffectEvent } from "react";
import { useTranslation } from "react-i18next";
import { ModeImage, StageImage } from "~/components/Image";
import type {
	BroadcastMap,
	BroadcastState,
	BroadcastStinger,
	BroadcastView,
} from "../broadcast-types";
import {
	inkColorVars,
	type MatchSide,
	matchSides,
	roundLabel,
	scenePart,
} from "../broadcast-utils";
import * as StingerContent from "../core/StingerContent";
import { SetLength } from "./SetLength";
import styles from "./Stinger.module.css";
import { TeamLogo } from "./TeamLogo";

const part = scenePart("stinger");

// a theme turning the animations off would otherwise leave the stinger covering the screen for good
const STINGER_FALLBACK_MS = 10_000;

/** Each design's panels in stacking order, `a` and `b` being the team colored ones. */
const DESIGN_PANELS: Record<BroadcastStinger, Array<"a" | "b" | null>> = {
	versus: ["a", "b"],
	sweep: ["a", "b", null],
	shutter: [null, null, null, null, null, null, null, null],
	burst: ["a", "b", null],
};

/**
 * Full screen transition with the upcoming match's info, replacing a pre-rendered stinger video. Calls `onCovered`
 * once nothing of the scene underneath shows, the moment to change it, and `onDone` once the new scene is revealed.
 * Its timing is all CSS, scaled by `--bc-stinger-duration`.
 */
export function Stinger({
	design,
	state,
	view,
	onCovered,
	onDone,
}: {
	design: BroadcastStinger;
	/** The state going on air. */
	state: BroadcastState;
	view: BroadcastView;
	onCovered: () => void;
	onDone: () => void;
}) {
	const fallback = useEffectEvent(() => {
		onCovered();
		onDone();
	});
	useEffect(() => {
		const timeout = setTimeout(fallback, STINGER_FALLBACK_MS);
		return () => clearTimeout(timeout);
	}, []);

	const info = useStingerInfo(state, view);

	return (
		<div
			className={styles.stinger}
			data-stinger={design}
			style={inkColorVars(state[view])}
			{...part("stinger")}
			onAnimationEnd={(event) => {
				if (event.target === event.currentTarget) onDone();
			}}
		>
			<span
				className={styles.coverClock}
				onAnimationEnd={(event) => {
					event.stopPropagation();
					onCovered();
				}}
			/>
			<Panels design={design} />
			<Card info={info} logoUrl={state.tournament.logoUrl} />
		</div>
	);
}

interface StingerInfo {
	eyebrow: string;
	headline: string;
	tag: string | null;
	detail: React.ReactNode;
	sides: [MatchSide, MatchSide] | null;
	showScores: boolean;
	map: BroadcastMap | null;
}

function useStingerInfo(
	state: BroadcastState,
	view: BroadcastView,
): StingerInfo {
	const { t } = useTranslation(["broadcast", "game-misc"]);
	const match = state.match;
	const producer = state[view];
	const progress = match?.progress[view] ?? null;
	const content = StingerContent.resolve({
		scene: producer.scene,
		match,
		progress,
	});
	const sides = match ? matchSides(match, view, producer) : null;

	const eyebrow = match
		? roundLabel(match) || state.tournament.name
		: state.tournament.name;
	const showScores =
		(content.kind === "game" || content.kind === "result") &&
		(progress?.resultCount ?? 0) > 0;

	switch (content.kind) {
		case "game":
			return {
				eyebrow,
				headline: t("broadcast:overlay.game", { number: content.gameNumber }),
				tag:
					content.stakes === "final-game"
						? t("broadcast:overlay.finalGame")
						: content.stakes === "match-point"
							? t("broadcast:overlay.matchPoint")
							: null,
				detail: match ? <SetLength match={match} /> : null,
				sides,
				showScores,
				map: content.map,
			};
		case "result": {
			const winner = sides?.find((side) => side.index === content.winner);

			return {
				eyebrow,
				headline: winner?.team
					? t("broadcast:overlay.wins", { team: winner.team.name })
					: t("broadcast:overlay.setOver"),
				tag: null,
				detail: sides ? sides.map((side) => side.score).join(" – ") : null,
				sides,
				showScores,
				map: null,
			};
		}
		case "matchup":
			return {
				eyebrow: match?.bracketName ?? state.tournament.name,
				headline: match?.roundName ?? t("broadcast:overlay.upNext"),
				tag: null,
				detail: match ? <SetLength match={match} /> : null,
				sides,
				showScores,
				map: null,
			};
		case "scene":
			return {
				eyebrow: state.tournament.name,
				headline: t(`broadcast:overlay.title.${content.scene}`),
				tag: null,
				detail: state.settings.headline || null,
				sides,
				showScores,
				map: null,
			};
	}
}

/** The full screen shapes covering the scene, team colored ones carry the team in `data-team`. */
function Panels({ design }: { design: BroadcastStinger }) {
	const panels = DESIGN_PANELS[design];

	return panels.map((team, i) => (
		<div
			key={i}
			className={styles.panel}
			data-team={team ?? undefined}
			data-index={i}
			style={{ "--i": i, "--j": panels.length - 1 - i } as React.CSSProperties}
			{...part("stinger-panel")}
		/>
	));
}

/** The upcoming match's info, the same markup for every design. */
function Card({ info, logoUrl }: { info: StingerInfo; logoUrl: string }) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div
			className={styles.card}
			data-has-teams={info.sides ? true : undefined}
			{...part("stinger-card")}
		>
			<img
				className={styles.tournamentLogo}
				src={logoUrl}
				alt=""
				{...part("stinger-tournament-logo")}
			/>
			<div
				className={styles.info}
				data-has-map={info.map ? true : undefined}
				{...part("stinger-info")}
			>
				<div className={styles.eyebrow} {...part("stinger-eyebrow")}>
					{info.eyebrow}
				</div>
				<div className={styles.headline} {...part("stinger-headline")}>
					{info.headline}
				</div>
				{info.tag ? (
					<div className={styles.tag} {...part("stinger-tag")}>
						{info.tag}
					</div>
				) : null}
				{info.map ? (
					<StingerMap map={info.map} />
				) : info.detail ? (
					<div className={styles.detail} {...part("stinger-detail")}>
						{info.detail}
					</div>
				) : null}
			</div>
			{info.sides ? (
				<div className={styles.teams} {...part("stinger-teams")}>
					<StingerTeam side={info.sides[0]} showScore={info.showScores} />
					<span className={styles.versus} {...part("stinger-vs")}>
						{t("broadcast:overlay.vs")}
					</span>
					<StingerTeam side={info.sides[1]} showScore={info.showScores} />
				</div>
			) : null}
		</div>
	);
}

function StingerTeam({
	side,
	showScore,
}: {
	side: MatchSide;
	showScore: boolean;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<div
			className={styles.team}
			data-team={side.side}
			{...part("stinger-team")}
		>
			<TeamLogo
				team={side.team}
				className={styles.teamLogo}
				{...part("stinger-team-logo")}
			/>
			<span className={styles.teamName} {...part("stinger-team-name")}>
				{side.team?.name ?? t("broadcast:overlay.tbd")}
			</span>
			{showScore ? (
				<span className={styles.teamScore} {...part("stinger-team-score")}>
					{side.score}
				</span>
			) : null}
		</div>
	);
}

function StingerMap({ map }: { map: BroadcastMap }) {
	const { t } = useTranslation(["game-misc"]);

	return (
		<div className={styles.map} {...part("stinger-map")}>
			<div className={styles.mapThumb}>
				<StageImage
					stageId={map.stageId}
					width={240}
					loading="eager"
					className={styles.mapThumbImage}
					containerClassName={styles.mapThumbImage}
				/>
				<ModeImage
					mode={map.mode}
					size={44}
					loading="eager"
					containerClassName={styles.mapThumbMode}
				/>
			</div>
			<div className={styles.mapLabel}>
				<span className={styles.mapMode} {...part("stinger-mode")}>
					{t(`game-misc:MODE_LONG_${map.mode}`)}
				</span>
				<span className={styles.mapStage} {...part("stinger-stage")}>
					{t(`game-misc:STAGE_${map.stageId}`)}
				</span>
			</div>
		</div>
	);
}
