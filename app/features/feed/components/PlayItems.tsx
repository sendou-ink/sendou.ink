import clsx from "clsx";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { LinkButton } from "~/components/elements/Button";
import {
	Image,
	ModeImage,
	StageImage,
	TierImage,
	WeaponImage,
} from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { leaderboardsPage } from "~/features/leaderboards/leaderboards-urls";
import { settingsSearchParams } from "~/features/settings/settings-search-params";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	lobbyPage,
	SENDOUQ_PAGE,
	SETTINGS_PAGE,
	sendouQMatchPage,
	sqHeaderGuyImageUrl,
	teamPage,
	userPage,
} from "~/utils/urls";
import type { FeedItem } from "../core/FeedItems.server";
import type { FeedItemContent } from "./FeedItemCard";
import {
	countText,
	DayTime,
	LogoAvatar,
	MapTiles,
	NavIconAvatar,
	StageName,
	tierLabel,
	UnknownWeaponImage,
	UserName,
	UserStack,
	WeaponName,
	WeaponSlot,
	WinLoss,
} from "./FeedParts";
import partsStyles from "./FeedParts.module.css";
import styles from "./PlayItems.module.css";

export function playItemContent(item: FeedItem): FeedItemContent | null {
	switch (item.type) {
		case "SQ_SET": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: data.promotion ? (
					<>
						<UserName user={data.actor} /> ranked up to{" "}
						<b>{tierLabel(data.promotion.to)}</b> after a{" "}
						<Link to={sendouQMatchPage(data.matchId)}>SendouQ set</Link> win
					</>
				) : (
					<>
						<UserName user={data.actor} />
						's team beat a{" "}
						<b>{data.opponentTier ? tierLabel(data.opponentTier) : ""}</b> team
						in a <Link to={sendouQMatchPage(data.matchId)}>SendouQ set</Link>
					</>
				),
				body: (
					<>
						{data.promotion ? (
							<div className={clsx(partsStyles.hero, partsStyles.heroAccent)}>
								<div className={partsStyles.rowNoWrap}>
									<TierImage tier={data.promotion.from} width={56} />
									<span className="text-lighter">→</span>
									<TierImage tier={data.promotion.to} width={56} />
									<div className={clsx("ml-auto", styles.alignEnd)}>
										<div className="font-bold">
											<span className={styles.promotionFrom}>
												{tierLabel(data.promotion.from)} →{" "}
											</span>
											{tierLabel(data.promotion.to)}
										</div>
										{data.newSp !== null ? (
											<div className="text-xs text-lighter">
												{`${data.newSp}\u00a0SP`}
											</div>
										) : null}
									</div>
								</div>
								<div className={styles.heroResult}>
									<span className={styles.verdict}>
										{data.isWin ? "Victory" : "Defeat"}
									</span>
									<span className={styles.heroScore}>
										{data.score[0]}–{data.score[1]}
									</span>
									{data.spDiff !== null ? (
										<span
											className={clsx(
												"ml-auto",
												data.spDiff >= 0 ? styles.plusDelta : styles.minusDelta,
											)}
										>
											{data.spDiff > 0 ? "+" : ""}
											{data.spDiff} SP
										</span>
									) : null}
								</div>
							</div>
						) : (
							<>
								<span className={clsx(partsStyles.pill, partsStyles.upsetPill)}>
									Upset
								</span>
								<div
									className={clsx(
										styles.resultBand,
										data.isWin ? styles.resultBandWin : styles.resultBandLoss,
									)}
								>
									<span className={styles.verdict}>
										{data.isWin ? "Victory" : "Defeat"}
									</span>
									<span className={partsStyles.bigScore}>
										{data.score[0]}–{data.score[1]}
									</span>
									<span className="ml-auto" />
									{data.tier ? <TierImage tier={data.tier} width={36} /> : null}
									{data.spDiff !== null ? (
										<span className={styles.alignEnd}>
											<span
												className={
													data.spDiff >= 0
														? styles.plusDelta
														: styles.minusDelta
												}
											>
												{data.spDiff > 0 ? "+" : ""}
												{data.spDiff}
											</span>
											<br />
											<span className="text-xs text-lighter">
												{`${data.newSp}\u00a0SP`}
											</span>
										</span>
									) : null}
								</div>
							</>
						)}
						<MapTiles maps={data.maps} max={7} />
						<div className={styles.columns}>
							{[
								{ label: "Team", players: data.team },
								{ label: "Opponents", players: data.opponents },
							].map((side) => (
								<div key={side.label} className={styles.column}>
									<span className={styles.label}>{side.label}</span>
									{side.players.map((player) => (
										<div key={player.user.id} className={partsStyles.player}>
											<Avatar user={player.user} size="xxs" />
											<span className={partsStyles.ellipsis}>
												{player.user.username}
											</span>
											<WeaponSlot weaponSplId={player.weaponSplId} />
										</div>
									))}
								</div>
							))}
						</div>
					</>
				),
			};
		}
		case "SQ_STREAK": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> is on a <b>{data.streak}-set</b> win
						streak
					</>
				),
				body: (
					<div className={partsStyles.rowNoWrap}>
						<span className={clsx(partsStyles.bigScore, "text-success")}>
							{data.streak}
						</span>
						<div className="stack sm">
							<div className={partsStyles.row}>
								{Array.from({ length: data.streak }, (_, i) => (
									<WinLoss key={i} isWin />
								))}
							</div>
							{data.tier ? (
								<span className="text-xs text-lighter">
									{tierLabel(data.tier)} · {`${data.sp}\u00a0SP`}
								</span>
							) : null}
						</div>
						{data.tier ? (
							<span className="ml-auto">
								<TierImage tier={data.tier} width={56} />
							</span>
						) : null}
					</div>
				),
			};
		}
		case "SQ_LEADERBOARD": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> is <b>#{data.placement}</b> on the
						season leaderboard
					</>
				),
				body: (
					<>
						<table className={partsStyles.table}>
							<tbody>
								{data.neighbors.map((neighbor) => (
									<tr
										key={neighbor.user.id}
										className={clsx({
											[partsStyles.highlightRow]:
												neighbor.user.id === data.actor.id,
										})}
									>
										<td className={partsStyles.rankCell}>
											#{neighbor.placement}
										</td>
										<td className={partsStyles.fillCell}>
											<div className={partsStyles.rowNoWrap}>
												<Avatar user={neighbor.user} size="xxxsm" />
												<Link
													to={userPage(neighbor.user)}
													className={partsStyles.ellipsis}
												>
													{neighbor.user.username}
												</Link>
											</div>
										</td>
										<td className={partsStyles.numeric}>{neighbor.sp} SP</td>
									</tr>
								))}
							</tbody>
						</table>
						<div className="text-xs text-lighter">
							Top {Math.max(1, Math.round((data.placement / data.total) * 100))}
							% of {data.total} ranked players
							{data.tier ? ` · ${tierLabel(data.tier)}` : ""}
						</div>
					</>
				),
			};
		}
		case "SQ_MILESTONE": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> played their{" "}
						<b>{data.milestone}th</b> SendouQ set
					</>
				),
				body: (
					<div className={partsStyles.rowNoWrap}>
						<span className={partsStyles.bigScore}>{data.milestone}</span>
						<span className="text-xs text-lighter">
							sets since{" "}
							<LocaleTime
								inline
								date={data.since}
								options={{ month: "long", year: "numeric" }}
							/>
						</span>
					</div>
				),
			};
		}
		case "SQ_SEASON_RECAP": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} />
						's Season {data.season} recap
					</>
				),
				body: (
					<>
						<div className={styles.stats}>
							<div className={styles.stat}>
								<span className={styles.label}>Final rank</span>
								<span className={styles.statValue}>#{data.placement}</span>
								<span className="text-xs text-lighter">of {data.total}</span>
							</div>
							<div className={styles.stat}>
								<span className={styles.label}>Tier</span>
								<span className={styles.statValue}>
									{data.tier ? (
										<>
											<TierImage tier={data.tier} width={28} />
											{tierLabel(data.tier)}
										</>
									) : (
										"–"
									)}
								</span>
								<span className="text-xs text-lighter">{`${data.sp}\u00a0SP`}</span>
							</div>
							<div className={styles.stat}>
								<span className={styles.label}>Maps</span>
								<span className={styles.statValue}>
									{data.mapWins}–{data.mapLosses}
								</span>
								<span className="text-xs text-lighter">
									{Math.round(
										(data.mapWins /
											Math.max(1, data.mapWins + data.mapLosses)) *
											100,
									)}
									% won
								</span>
							</div>
							<div className={styles.stat}>
								<span className={styles.label}>Top weapon</span>
								<span className={styles.statValue}>
									{data.weaponSplId !== null ? (
										<WeaponImage
											weaponSplId={data.weaponSplId}
											variant="build"
											size={28}
										/>
									) : (
										<UnknownWeaponImage size={28} />
									)}
								</span>
								<span
									className={clsx(partsStyles.ellipsis, "text-xs text-lighter")}
								>
									{data.weaponSplId !== null ? (
										<WeaponName weaponSplId={data.weaponSplId} />
									) : (
										"None reported"
									)}
								</span>
							</div>
							<MapStat label="Best map" map={data.bestMap} />
							<MapStat label="Worst map" map={data.worstMap} />
						</div>
					</>
				),
			};
		}
		case "SQ_RIVALRY": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> keeps running into{" "}
						<UserName user={data.other} />
					</>
				),
				body: (
					<div className={clsx(partsStyles.inset, partsStyles.vs)}>
						<div className={partsStyles.vsSide}>
							<Avatar user={data.actor} size="sm" />
							<span className={partsStyles.ellipsis}>
								{data.actor.username}
							</span>
						</div>
						<div>
							<div className={partsStyles.bigScore}>
								{data.sets[0]}–{data.sets[1]}
							</div>
							<div className="text-xs text-lighter">sets this season</div>
							<div className="text-xs text-lighter">
								{data.maps[0]}–{data.maps[1]} maps
							</div>
						</div>
						<div className={partsStyles.vsSide}>
							<Avatar user={data.other} size="sm" />
							<span className={partsStyles.ellipsis}>
								{data.other.username}
							</span>
						</div>
					</div>
				),
			};
		}
		case "SQ_SEASON_START": {
			const { data } = item;
			return {
				avatar: <NavIconAvatar navIcon="sendouq" />,
				line: data.isCountdown ? (
					<>
						<b>SendouQ Season {data.nth}</b> starts{" "}
						<DayTime at={data.startsAt} />
					</>
				) : (
					<>
						<b>SendouQ Season {data.nth}</b> has started
					</>
				),
				body: (
					<div className={clsx(partsStyles.hero, partsStyles.heroAccent)}>
						<div className={partsStyles.rowNoWrap}>
							<div className={partsStyles.grow}>
								<div className={partsStyles.bigScore}>Season {data.nth}</div>
								<div className="text-xs text-lighter">
									<LocaleTimeRange
										from={data.startsAt}
										to={data.endsAt}
										options={{ month: "short", day: "numeric" }}
										inline
									/>
								</div>
							</div>
							<Image
								path={sqHeaderGuyImageUrl(data.nth)}
								alt=""
								width={96}
								containerClassName={partsStyles.noShrink}
							/>
						</div>
						{data.isCountdown ? (
							<LinkButton
								to={settingsSearchParams.href(SETTINGS_PAGE, {
									tab: "match-profile",
								})}
								size="small"
							>
								Set up your match profile
							</LinkButton>
						) : (
							<LinkButton to={SENDOUQ_PAGE} size="small">
								Join the queue
							</LinkButton>
						)}
					</div>
				),
			};
		}
		case "SQ_SEASON_ENDING": {
			const { data } = item;
			const { goal, rank } = data;
			return {
				avatar: <NavIconAvatar navIcon="sendouq" />,
				line: (
					<>
						<b>SendouQ Season {data.nth}</b> ends <DayTime at={data.endsAt} />
					</>
				),
				body: (
					<div className={clsx(partsStyles.inset, partsStyles.rowNoWrap)}>
						{rank ? <TierImage tier={rank.tier} width={40} /> : null}
						<div className={partsStyles.grow}>
							<div className="font-semi-bold">
								{rank
									? `${tierLabel(rank.tier)} · ${rank.sp}\u00a0SP`
									: `${data.setCount} ${data.setCount === 1 ? "set" : "sets"} played`}
							</div>
							{rank ? (
								<div className="text-xs text-lighter">
									{rank.placement ? `#${rank.placement} · ` : null}
									{countText(data.setCount, "set")} played
								</div>
							) : null}
							{goal ? (
								<div className="text-sm">
									{goal.type === "GET_RANKED" ? (
										<>
											<b>
												{goal.setsShort} more{" "}
												{goal.setsShort === 1 ? "set" : "sets"}
											</b>{" "}
											to get ranked
										</>
									) : (
										<>
											<b>{goal.spShort} SP</b> away from{" "}
											<b>{tierLabel(goal.tier)}</b>
										</>
									)}
								</div>
							) : null}
						</div>
					</div>
				),
				href: SENDOUQ_PAGE,
			};
		}
		case "LEADERBOARD_TOP": {
			const { data } = item;
			return {
				avatar: <NavIconAvatar navIcon="leaderboards" />,
				line: (
					<>
						<b>Top of the SendouQ leaderboard</b> this week
					</>
				),
				body: (
					<>
						<div className={clsx(styles.columns, styles.columnsStackNarrow)}>
							<div className={styles.column}>
								<span className={styles.label}>Players</span>
								{data.players.map((player) => (
									<div key={player.user.id} className={partsStyles.player}>
										<Avatar user={player.user} size="xxs" />
										<span className={partsStyles.ellipsis}>
											<Link to={userPage(player.user)}>
												{player.user.username}
											</Link>
											<PlacementMovement
												placement={player.placement}
												previousPlacement={player.previousPlacement}
											/>
										</span>
										<span
											className={clsx(styles.alignEnd, "whitespace-nowrap")}
										>
											{player.sp.toFixed(1)}
											{player.weeklyChange ? (
												<span
													className={clsx(
														"text-xs",
														player.weeklyChange > 0
															? styles.plusDelta
															: styles.minusDelta,
													)}
												>
													{" "}
													{player.weeklyChange > 0 ? "+" : ""}
													{player.weeklyChange}
												</span>
											) : null}
										</span>
									</div>
								))}
							</div>
							<div className={styles.column}>
								<span className={styles.label}>Teams</span>
								{data.teams.map((entry) => (
									<div key={entry.placement} className={partsStyles.player}>
										<UserStack users={entry.members} />
										{entry.team ? (
											<Link
												to={teamPage(entry.team.customUrl)}
												className={partsStyles.ellipsis}
											>
												{entry.team.name}
											</Link>
										) : (
											<span className={partsStyles.ellipsis}>
												{entry.members
													.map((member) => member.username)
													.join(", ")}
											</span>
										)}
										<span className={styles.alignEnd}>
											{entry.sp.toFixed(1)}
										</span>
									</div>
								))}
							</div>
						</div>
						<Link
							to={leaderboardsPage({ season: data.season })}
							className="text-xs font-semi-bold"
						>
							Full leaderboard
						</Link>
					</>
				),
			};
		}
		case "SQ_META": {
			const { data } = item;
			return {
				avatar: <NavIconAvatar navIcon="sendouq" />,
				line: (
					<>
						<b>Weapon trends</b> in SendouQ this week
					</>
				),
				body: (
					<>
						<div className={styles.columns}>
							{[
								{ label: "Rising", rows: data.rising },
								{ label: "Falling", rows: data.falling },
							].map((column) => (
								<div key={column.label} className={styles.column}>
									<span className={styles.label}>{column.label}</span>
									{column.rows.map((row) => (
										<div
											key={row.weaponSplId}
											className={partsStyles.rowNoWrap}
										>
											<WeaponImage
												weaponSplId={row.weaponSplId}
												variant="build"
												size={26}
											/>
											<span className="text-xs">{row.sharePercentage}%</span>
											<span
												className={clsx(
													"ml-auto text-xs",
													row.changePercentage === null ||
														row.changePercentage > 0
														? styles.plusDelta
														: styles.minusDelta,
												)}
											>
												{row.changePercentage === null
													? "New"
													: `${row.changePercentage > 0 ? "+" : ""}${row.changePercentage}%`}
											</span>
										</div>
									))}
								</div>
							))}
						</div>
						<div className="text-xs text-lighter">
							Change in share of play vs last week, weighted towards higher
							ranked players · {data.playerCount} players
						</div>
					</>
				),
			};
		}
		case "LOBBY_RECAP": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={null} name={data.name} />,
				line: (
					<>
						<Link to={lobbyPage(data.lobbyId)} className="font-bold">
							{data.name}
						</Link>{" "}
						wrapped up · {countText(data.setCount, "set")},{" "}
						{countText(data.playerCount, "player")}
					</>
				),
				body: (
					<table className={partsStyles.table}>
						<tbody>
							{data.top.map((player) => (
								<tr key={player.id}>
									<td className={partsStyles.rankCell}>#{player.placement}</td>
									<td className={partsStyles.fillCell}>
										<div className={partsStyles.rowNoWrap}>
											<Avatar user={player} size="xxxsm" />
											<span className={partsStyles.ellipsis}>
												<UserName user={player} />
											</span>
										</div>
									</td>
									<td className={partsStyles.numeric}>
										{player.setWins}–{player.setLosses}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				),
			};
		}
		default:
			return null;
	}
}

function MapStat({
	label,
	map,
}: {
	label: string;
	map: {
		mode: ModeShort;
		stageId: StageId;
		wins: number;
		losses: number;
	} | null;
}) {
	return (
		<div className={clsx(styles.stat, styles.statMap)}>
			{map ? (
				<StageImage
					stageId={map.stageId}
					width={240}
					className={styles.statMapImage}
					containerClassName={styles.statMapImageContainer}
				/>
			) : null}
			<span className={styles.label}>{label}</span>
			<span className={styles.statValue}>
				{map ? `${map.wins}–${map.losses}` : "–"}
			</span>
			<span className={clsx(partsStyles.rowNoWrap, "text-xs")}>
				{map ? (
					<>
						<ModeImage mode={map.mode} size={16} />
						<span className={partsStyles.ellipsis}>
							<StageName stageId={map.stageId} />
						</span>
					</>
				) : (
					"Not enough games"
				)}
			</span>
		</div>
	);
}

function PlacementMovement({
	placement,
	previousPlacement,
}: {
	placement: number;
	previousPlacement: number | null;
}) {
	if (previousPlacement === null) {
		return <span className={clsx(styles.plusDelta, "text-xs")}> new</span>;
	}
	if (previousPlacement === placement) return null;

	const isUp = previousPlacement > placement;

	return (
		<span
			className={clsx(isUp ? styles.plusDelta : styles.minusDelta, "text-xs")}
		>
			{" "}
			{isUp ? "▲" : "▼"}
			{Math.abs(previousPlacement - placement)}
		</span>
	);
}
