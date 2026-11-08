import type * as React from "react";
import { useTranslation } from "react-i18next";
import { Flag } from "~/components/Flag";
import { ModeImage, StageImage, WeaponImage } from "~/components/Image";
import { useFitText } from "../broadcast-hooks";
import type {
	BroadcastPlayer,
	BroadcastState,
	BroadcastTeamSet,
	BroadcastTeamSpotlight,
	BroadcastView,
	BroadcastWeaponImages,
} from "../broadcast-types";
import { combineStyles, matchSides, scenePart } from "../broadcast-utils";
import { HoldScene } from "./HoldScene";
import { SceneBackdrop } from "./SceneBackdrop";
import { TeamLogo } from "./TeamLogo";
import layout from "./TeamScene.layout.module.css";
import look from "./TeamScene.module.css";

const styles = combineStyles(look, layout);

const part = scenePart("team");

/** The latest sets shown, earlier ones are dropped. */
const MAX_SETS_SHOWN = 4;

/**
 * Full screen of one team, any team of the tournament: who they are, their record and run through the tournament so
 * far, and how they did per mode with the maps they picked. A team of the featured match is in its side's color.
 */
export function TeamScene({
	state,
	view,
}: {
	state: BroadcastState;
	view: BroadcastView;
}) {
	const { t } = useTranslation(["broadcast"]);
	const spotlight = state.team[view];
	const nameRef = useFitText<HTMLHeadingElement>({
		text: spotlight?.team.name ?? "",
	});

	if (!spotlight) {
		return <HoldScene scene="team" state={state} view={view} />;
	}

	const { team, record } = spotlight;
	const side = state.match
		? matchSides(state.match, view, state[view]).find(
				(candidate) => candidate.team?.id === team.id,
			)?.side
		: undefined;
	const hasMapInfo = spotlight.modes.length > 0 || spotlight.mapPool.length > 0;
	const run = <Run sets={spotlight.sets} maxShown={MAX_SETS_SHOWN} />;

	return (
		<div className={styles.teamScene} data-team={side}>
			<SceneBackdrop />
			<header className={styles.header} {...part("header")}>
				<TeamLogo team={team} className={styles.logo} {...part("team-logo")} />
				<div className={styles.identity}>
					<div className={styles.eyebrow}>
						<span {...part("tournament-name")}>{state.tournament.name}</span>
						{team.seed ? (
							<span className={styles.seed} {...part("team-seed")}>
								{t("broadcast:overlay.seed", { seed: team.seed })}
							</span>
						) : null}
					</div>
					<h1 ref={nameRef} className={styles.name} {...part("team-name")}>
						{team.name}
					</h1>
				</div>
				<div className={styles.stats}>
					<Stat
						label={t("broadcast:overlay.sets")}
						wins={record.setWins}
						losses={record.setLosses}
					/>
					<Stat
						label={t("broadcast:overlay.maps")}
						wins={record.mapWins}
						losses={record.mapLosses}
					/>
				</div>
			</header>
			<div className={styles.body}>
				<div className={styles.column}>
					<section className={styles.section}>
						<SectionTitle>{t("broadcast:overlay.roster")}</SectionTitle>
						<ul className={styles.players}>
							{team.players.map((player, i) => (
								<Player
									key={player.userId}
									player={player}
									weaponImages={state.settings.weaponImages}
									style={{ "--i": i } as React.CSSProperties}
								/>
							))}
						</ul>
					</section>
					{hasMapInfo ? run : null}
				</div>
				<div className={styles.column}>
					{hasMapInfo ? (
						<>
							{spotlight.modes.length > 0 ? (
								<Modes modes={spotlight.modes} />
							) : null}
							{spotlight.mapPool.length > 0 ? (
								<MapPool mapPool={spotlight.mapPool} />
							) : null}
						</>
					) : (
						run
					)}
				</div>
			</div>
		</div>
	);
}

function Stat({
	label,
	wins,
	losses,
}: {
	label: string;
	wins: number;
	losses: number;
}) {
	const total = wins + losses;

	return (
		<div className={styles.stat} {...part("stat")}>
			<span className={styles.statLabel} {...part("stat-label")}>
				{label}
			</span>
			<span className={styles.statValue} {...part("stat-value")}>
				{wins}–{losses}
			</span>
			<span className={styles.statShare} {...part("stat-share")}>
				{total > 0 ? `${Math.round((wins / total) * 100)}%` : "–"}
			</span>
		</div>
	);
}

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h2 className={styles.sectionTitle} {...part("section-title")}>
			{children}
		</h2>
	);
}

/** A card of the roster: the player's avatar with their name and weapons under it. */
function Player({
	player,
	weaponImages,
	style,
}: {
	player: BroadcastPlayer;
	weaponImages: BroadcastWeaponImages;
	style: React.CSSProperties;
}) {
	const nameRef = useFitText<HTMLSpanElement>({ text: player.name });

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
				<div className={styles.avatar} {...part("player-avatar")} />
			)}
			<span className={styles.playerName} {...part("player-name")}>
				{player.country ? <Flag countryCode={player.country} tiny /> : null}
				<span ref={nameRef} className={styles.playerNameText}>
					{player.name}
				</span>
			</span>
			<span className={styles.weapons} {...part("player-weapons")}>
				{player.weapons.map((weaponSplId) => (
					<WeaponImage
						key={weaponSplId}
						weaponSplId={weaponSplId}
						variant={weaponImages === "outlined" ? "badge" : "build"}
						size={44}
						loading="eager"
					/>
				))}
			</span>
		</li>
	);
}

function Run({
	sets,
	maxShown,
}: {
	sets: BroadcastTeamSet[];
	/** The latest ones are shown. */
	maxShown: number;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<section className={styles.section}>
			<SectionTitle>{t("broadcast:overlay.runSoFar")}</SectionTitle>
			{sets.length === 0 ? (
				<p className={styles.empty}>{t("broadcast:overlay.noSetsYet")}</p>
			) : (
				<ol className={styles.sets}>
					{sets.slice(-maxShown).map((set, i) => (
						<SetRow
							key={set.matchId}
							set={set}
							style={{ "--i": i } as React.CSSProperties}
						/>
					))}
				</ol>
			)}
		</section>
	);
}

function SetRow({
	set,
	style,
}: {
	set: BroadcastTeamSet;
	style: React.CSSProperties;
}) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<li
			className={styles.set}
			data-status={set.status}
			style={style}
			{...part("set")}
		>
			<span className={styles.setScore} {...part("set-score")}>
				{set.status === "upcoming"
					? t("broadcast:overlay.upNext")
					: `${set.scores[0]}–${set.scores[1]}`}
			</span>
			<div className={styles.setInfo}>
				<span className={styles.setRound} {...part("set-round")}>
					{[
						set.status === "live" ? t("broadcast:overlay.next") : null,
						set.roundLabel,
					]
						.filter(Boolean)
						.join(" · ")}
				</span>
				<span className={styles.setOpponent} {...part("set-opponent")}>
					<span className={styles.versus}>{t("broadcast:overlay.vs")}</span>
					<TeamLogo team={set.opponent} className={styles.opponentLogo} />
					{typeof set.opponent?.seed === "number" ? (
						<span
							className={styles.opponentSeed}
							{...part("set-opponent-seed")}
						>
							{set.opponent.seed}
						</span>
					) : null}
					<span className={styles.opponentName}>
						{set.opponent?.name ?? t("broadcast:overlay.tbd")}
					</span>
				</span>
			</div>
			<ol className={styles.setGames} {...part("set-games")}>
				{set.games.map((game, i) => (
					<li
						key={i}
						className={styles.setGame}
						data-result={game.isWin ? "win" : "loss"}
						{...part("set-game")}
					>
						<ModeImage mode={game.mode} size={24} loading="eager" />
					</li>
				))}
			</ol>
		</li>
	);
}

function Modes({ modes }: { modes: BroadcastTeamSpotlight["modes"] }) {
	const { t } = useTranslation(["broadcast"]);

	return (
		<section className={styles.section}>
			<SectionTitle>{t("broadcast:overlay.modes")}</SectionTitle>
			<ul className={styles.modes}>
				{modes.map((modeRecord) => (
					<li
						key={modeRecord.mode}
						className={styles.mode}
						{...part("mode-record")}
					>
						<ModeImage mode={modeRecord.mode} size={36} loading="eager" />
						<span>
							{modeRecord.wins}–{modeRecord.losses}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}

function MapPool({ mapPool }: { mapPool: BroadcastTeamSpotlight["mapPool"] }) {
	const { t } = useTranslation(["broadcast", "game-misc", "common"]);

	return (
		<section className={styles.section}>
			<SectionTitle>{t("broadcast:overlay.mapPool")}</SectionTitle>
			<ul className={styles.mapPool} {...part("map-pool")}>
				{mapPool.map((map, i) => (
					<li
						key={`${map.mode}-${map.stageId}`}
						className={styles.map}
						style={{ "--i": i } as React.CSSProperties}
						{...part("map")}
					>
						<div className={styles.mapThumbnail}>
							<StageImage
								stageId={map.stageId}
								width={200}
								loading="eager"
								className={styles.mapImage}
								containerClassName={styles.mapImage}
							/>
							<span className={styles.mapMode} {...part("map-mode")}>
								{t(`common:modes.short.${map.mode}`)}
							</span>
						</div>
						<span className={styles.mapName} {...part("map-name")}>
							{t(`game-misc:STAGE_${map.stageId}`)}
						</span>
					</li>
				))}
			</ul>
		</section>
	);
}
