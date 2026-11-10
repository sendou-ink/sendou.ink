import type * as React from "react";
import { useTranslation } from "react-i18next";
import { WeaponImage } from "~/components/Image";
import type {
	BroadcastPlayer,
	BroadcastView,
	BroadcastWeaponImages,
} from "~/features/broadcast/broadcast-types";
import {
	combineStyles,
	type MatchSide,
	matchSides,
	roundLabel,
} from "~/features/broadcast/broadcast-utils";
import { SetLength } from "~/features/broadcast/components/SetLength";
import { TeamLogo } from "~/features/broadcast/components/TeamLogo";
import type { CastBroadcastState } from "../broadcast-cast-types";
import { scenePart } from "../broadcast-cast-utils";
import layout from "./RostersScene.layout.module.css";
import look from "./RostersScene.module.css";
import { SceneBackdrop } from "./SceneBackdrop";

const styles = combineStyles(look, layout);

const part = scenePart("rosters");

/** Full screen before the set: both teams facing each other with their rosters, with their active rosters. */
export function RostersScene({
	state,
	view,
}: {
	state: CastBroadcastState;
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
							{roundLabel(match) ? " · " : null}
							<span {...part("set-length")}>
								<SetLength match={match} />
							</span>
						</div>
					) : null}
				</div>
			</header>
			{match ? (
				<div className={styles.teams}>
					{matchSides(match, view, state[view]).map((side) => (
						<RosterTeam
							key={side.side}
							side={side}
							weaponImages={state.settings.weaponImages}
						/>
					))}
					<div className={styles.versus} {...part("versus")}>
						<span>{t("broadcast:overlay.vs")}</span>
					</div>
				</div>
			) : null}
		</div>
	);
}

function RosterTeam({
	side,
	weaponImages,
}: {
	side: MatchSide;
	weaponImages: BroadcastWeaponImages;
}) {
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
			<ul className={styles.players}>
				{players.map((player, i) => (
					<Player
						key={player.userId}
						player={player}
						weaponImages={weaponImages}
						style={{ "--i": i } as React.CSSProperties}
					/>
				))}
			</ul>
		</section>
	);
}

function Player({
	player,
	weaponImages,
	style,
}: {
	player: BroadcastPlayer;
	weaponImages: BroadcastWeaponImages;
	style: React.CSSProperties;
}) {
	return (
		<li className={styles.player} style={style} {...part("player")}>
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
			<span className={styles.weapons} {...part("player-weapons")}>
				{player.weapons.map((weaponSplId) => (
					<WeaponImage
						key={weaponSplId}
						weaponSplId={weaponSplId}
						variant={weaponImages === "outlined" ? "badge" : "build"}
						size={72}
						loading="eager"
					/>
				))}
			</span>
		</li>
	);
}
