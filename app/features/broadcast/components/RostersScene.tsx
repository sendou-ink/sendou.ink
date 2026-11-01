import type * as React from "react";
import { useTranslation } from "react-i18next";
import { WeaponImage } from "~/components/Image";
import type {
	BroadcastPlayer,
	BroadcastState,
	BroadcastView,
} from "../broadcast-types";
import {
	type MatchSide,
	matchSides,
	roundLabel,
	scenePart,
} from "../broadcast-utils";
import styles from "./RostersScene.module.css";
import { SceneBackdrop } from "./SceneBackdrop";
import { SetLength } from "./SetLength";
import { TeamLogo } from "./TeamLogo";

const part = scenePart("rosters");

/** More players than this are listed tighter so that all of them fit. */
const ROSTER_SPACIOUS_MAX_PLAYERS = 6;

/** Full screen before the set: both teams facing each other with their rosters, the active roster highlighted once picked. */
export function RostersScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const { t } = useTranslation(["broadcast"]);
	const match = state.match;

	return (
		<div className={styles.rosters}>
			<SceneBackdrop />
			<header className={styles.header} {...part("header")}>
				<img
					className={styles.tournamentLogo}
					src={state.tournament.logoUrl}
					alt=""
					{...part("tournament-logo")}
				/>
				<div className={styles.headerText}>
					<div className={styles.tournamentName} {...part("tournament-name")}>
						{state.tournament.name}
					</div>
					{match ? (
						<div className={styles.round} {...part("round")}>
							{roundLabel(match)}
							<span className={styles.setLength} {...part("set-length")}>
								<SetLength match={match} />
							</span>
						</div>
					) : null}
				</div>
			</header>
			{match ? (
				<div className={styles.teams}>
					{matchSides(match, view, state[view]).map((side) => (
						<RosterTeam key={side.side} side={side} />
					))}
					<div className={styles.versus} {...part("versus")}>
						<span>{t("broadcast:overlay.vs")}</span>
					</div>
				</div>
			) : null}
		</div>
	);
}

function RosterTeam({ side }: { side: MatchSide }) {
	const { t } = useTranslation(["broadcast"]);
	const players = side.team?.players ?? [];

	return (
		<section className={styles.team} data-team={side.side} {...part("team")}>
			<div className={styles.teamHeader}>
				<TeamLogo
					team={side.team}
					className={styles.teamLogo}
					{...part("team-logo")}
				/>
				<div className={styles.teamTitle}>
					<h2 className={styles.teamName} {...part("team-name")}>
						{side.team?.name ?? t("broadcast:overlay.tbd")}
					</h2>
					{side.team?.seed ? (
						<span className={styles.seed} {...part("team-seed")}>
							{t("broadcast:overlay.seed", { seed: side.team.seed })}
						</span>
					) : null}
				</div>
			</div>
			<ul
				className={styles.players}
				data-dense={players.length > ROSTER_SPACIOUS_MAX_PLAYERS || undefined}
			>
				{players.map((player, i) => (
					<Player
						key={player.userId}
						player={player}
						style={{ "--i": i } as React.CSSProperties}
					/>
				))}
			</ul>
		</section>
	);
}

function Player({
	player,
	style,
}: {
	player: BroadcastPlayer;
	style: React.CSSProperties;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<li
			className={styles.player}
			data-active={player.isActive === false ? "false" : undefined}
			style={style}
			{...part("player")}
		>
			{player.avatarUrl ? (
				<img
					className={styles.avatar}
					src={player.avatarUrl}
					alt=""
					{...part("player-avatar")}
				/>
			) : (
				// xxx: some avatar fallback for users with no avatar set
				<div className={styles.avatar} {...part("player-avatar")} />
			)}
			<span className={styles.playerName} {...part("player-name")}>
				{player.name}
			</span>
			{player.isSub ? (
				<span className={styles.sub} {...part("player-sub")}>
					{t("broadcast:overlay.sub")}
				</span>
			) : null}
			<span className={styles.weapons} {...part("player-weapons")}>
				{player.weapons.map((weaponSplId) => (
					<WeaponImage
						key={weaponSplId}
						weaponSplId={weaponSplId}
						variant="build"
						size={52}
						loading="eager"
					/>
				))}
			</span>
		</li>
	);
}
