import { useTranslation } from "react-i18next";
import { WeaponImage } from "~/components/Image";
import type {
	BroadcastPlayer,
	BroadcastState,
	BroadcastTeam,
	BroadcastView,
} from "../broadcast-types";
import { scenePart, teamsBySide } from "../broadcast-utils";
import { SetLength } from "./GameScene";
import styles from "./RostersScene.module.css";

const part = scenePart("rosters");

/** Full screen before the set: both teams with their registered rosters, the active roster highlighted once picked. */
export function RostersScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const match = state.match;

	return (
		<div className={styles.rosters}>
			<header className={styles.header} {...part("header")}>
				<img
					className={styles.tournamentLogo}
					src={state.tournament.logoUrl}
					alt=""
					{...part("tournament-logo")}
				/>
				<div>
					<div className={styles.tournamentName}>{state.tournament.name}</div>
					{match ? (
						<div className={styles.round} {...part("round")}>
							{[match.bracketName, match.roundName].filter(Boolean).join(" · ")}{" "}
							· <SetLength match={match} />
						</div>
					) : null}
				</div>
			</header>
			{match ? (
				<div className={styles.teams}>
					{teamsBySide(match, state[view].swapSides).map((team, i) => (
						<RosterTeam
							key={team?.id ?? i}
							team={team}
							side={i === 0 ? "a" : "b"}
						/>
					))}
				</div>
			) : null}
		</div>
	);
}

function RosterTeam({
	team,
	side,
}: {
	team: BroadcastTeam | null;
	side: "a" | "b";
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<section className={styles.team} data-team={side} {...part("team")}>
			<div className={styles.teamHeader}>
				{team?.logoUrl ? (
					<img
						className={styles.teamLogo}
						src={team.logoUrl}
						alt=""
						{...part("team-logo")}
					/>
				) : null}
				<h2 className={styles.teamName} {...part("team-name")}>
					{team?.name ?? t("broadcast:overlay.tbd")}
				</h2>
			</div>
			<ul className={styles.players}>
				{team?.players.map((player) => (
					<Player key={player.userId} player={player} />
				))}
			</ul>
		</section>
	);
}

function Player({ player }: { player: BroadcastPlayer }) {
	return (
		<li
			className={styles.player}
			data-active={player.isActive === false ? "false" : undefined}
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
				<div className={styles.avatar} {...part("player-avatar")} />
			)}
			<span className={styles.playerName} {...part("player-name")}>
				{player.name}
			</span>
			<span className={styles.weapons} {...part("player-weapons")}>
				{player.weapons.map((weaponSplId) => (
					<WeaponImage
						key={weaponSplId}
						weaponSplId={weaponSplId}
						variant="build"
						size={48}
						loading="eager"
					/>
				))}
			</span>
		</li>
	);
}
