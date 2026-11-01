import clsx from "clsx";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Image, ModeImage, StageImage } from "~/components/Image";
import { LocaleTime } from "~/components/LocaleTime";
import {
	InstallAction,
	usePromptInstallState,
} from "~/features/front-page/components/PWAInstallBanner";
import { navIconUrl } from "~/utils/urls";
import type { FeedItem } from "../core/FeedItems.server";
import { FEED_ROTATION_MAX_LISTED } from "../feed-constants";
import type { FeedItemContent } from "./FeedItemCard";
import {
	DateBlock,
	DayTime,
	groupedNumber,
	LogoAvatar,
	NavIconAvatar,
	ordinalPlacement,
	TournamentRow,
	UserName,
	UserStack,
} from "./FeedParts";
import styles from "./FeedParts.module.css";

// xxx: i18n (other files too)

export function communityItemContent(
	item: FeedItem,
	_now: number,
): FeedItemContent | null {
	switch (item.type) {
		case "FRIEND_NEW": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> and <UserName user={data.other} />{" "}
						are now friends
					</>
				),
				body: <UserStack users={[data.actor, data.other]} />,
			};
		}
		case "FRIEND_SUGGEST": {
			const { data } = item;
			const setCount = data.setWins + data.setLosses;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						You've played <b>{setCount} sets</b> with{" "}
						<UserName user={data.actor} />
					</>
				),
				body: (
					<div className={clsx(styles.inset, styles.rowNoWrap)}>
						<Avatar user={data.actor} size="sm" />
						<div>
							<div className="font-semi-bold">{data.actor.username}</div>
							<div className="text-xs text-lighter">
								{data.setWins}–{data.setLosses} as teammates · not friends yet
							</div>
						</div>
					</div>
				),
				action: { type: "SEND_FRIEND_REQUEST", userId: data.actor.id },
			};
		}
		case "PLUS_RESULTS": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={null} name="Plus Server" />,
				line: (
					<>
						{data.rows.length === 1 ? (
							<>
								<UserName user={data.rows[0].user} /> made it to{" "}
								<b>+{data.rows[0].tier}</b>
							</>
						) : (
							<>
								<b>{data.rows.length} friends</b> made it to a new Plus Server
								tier
							</>
						)}
					</>
				),
				body: (
					<div className={styles.row}>
						{data.rows.map((row) => (
							<span
								key={row.user.id}
								className={clsx(styles.inset, styles.rowNoWrap)}
							>
								<Avatar user={row.user} size="xxs" />
								<UserName user={row.user} />
								<span className={styles.plusTier}>
									<Image
										path={navIconUrl("plus")}
										alt="Plus Server"
										size={14}
									/>
									{row.tier}
								</span>
							</span>
						))}
					</div>
				),
			};
		}
		case "SITE_UPDATE": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={null} name="sendou.ink" />,
				line: (
					<>
						<b>sendou.ink</b> update
					</>
				),
				body: (
					<div className="stack sm">
						{data.entries.map((entry) => (
							<div key={entry.headline} className={styles.inset}>
								<div className={styles.rowNoWrap}>
									{entry.navItems?.[0] ? (
										<Image
											path={navIconUrl(entry.navItems[0])}
											alt=""
											size={22}
											containerClassName={styles.noShrink}
										/>
									) : null}
									<span className="font-semi-bold">
										{entry.headline.replaceAll("**", "")}
									</span>
								</div>
								{entry.bullets && entry.bullets.length > 0 ? (
									<ul className="text-xs text-lighter">
										{entry.bullets.slice(0, 3).map((bullet) => (
											<li key={bullet}>{bullet.replaceAll("**", "")}</li>
										))}
									</ul>
								) : null}
							</div>
						))}
					</div>
				),
			};
		}
		case "ROTATION": {
			const { data } = item;
			return {
				avatar: <ModeImage mode={data.rotations[0].mode} size={36} />,
				line: (
					<>
						<b>
							{data.rotations.length} upcoming rotation
							{data.rotations.length === 1 ? "" : "s"}
						</b>{" "}
						in your usual hours with maps from your pool
					</>
				),
				body: (
					<>
						<div className={styles.list}>
							{data.rotations
								.slice(0, FEED_ROTATION_MAX_LISTED)
								.map((rotation) => (
									<div
										key={`${rotation.type}-${rotation.startsAt}`}
										className={styles.rotationRow}
									>
										<div>
											<div className="text-sm font-semi-bold">
												<LocaleTime
													inline
													date={rotation.startsAt}
													options={{
														weekday: "short",
														hour: "numeric",
														minute: "2-digit",
													}}
												/>
											</div>
											<div
												className={clsx(
													styles.rowNoWrap,
													"text-xs text-lighter",
												)}
											>
												<ModeImage mode={rotation.mode} size={16} />
												{rotationTypeLabel(rotation.type)}
											</div>
										</div>
										<div className={styles.rotationStages}>
											{rotation.stageIds.map((stageId) => (
												<StageImage
													key={stageId}
													stageId={stageId}
													width={96}
													className={clsx(styles.rotationStage, {
														[styles.rotationStageOff]:
															!rotation.matchingStageIds.includes(stageId),
													})}
												/>
											))}
										</div>
									</div>
								))}
						</div>
						{data.rotations.length > FEED_ROTATION_MAX_LISTED ? (
							<div className="text-xs text-lighter">
								+{data.rotations.length - FEED_ROTATION_MAX_LISTED} more later
							</div>
						) : null}
					</>
				),
			};
		}
		case "VOICE_ROOM": {
			const { data } = item;
			return {
				avatar: data.users[0] ? (
					<Avatar user={data.users[0]} size="xs" />
				) : null,
				line: (
					<>
						{data.users[0] ? <UserName user={data.users[0]} /> : "Someone"} and{" "}
						{data.userCount - 1} others are in voice
					</>
				),
				body: (
					<div className={clsx(styles.inset, styles.rowNoWrap)}>
						<UserStack users={data.users} />
						<span className="text-xs text-lighter">
							{data.roomType.replaceAll("_", " ").toLowerCase()}
						</span>
					</div>
				),
			};
		}
		case "MEMORY": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={null} name="Memories" />,
				line: (
					<>
						<b>{data.yearsAgo} years ago</b> you played your first sendou.ink
						tournament
					</>
				),
				body: (
					<>
						<div className={clsx(styles.inset, styles.rowNoWrap)}>
							<TournamentRow tournament={data.tournament} />
							<span className={styles.placing}>
								{ordinalPlacement(data.placement)}
								<span className="text-xs text-lighter">
									/{data.participantCount}
								</span>
							</span>
						</div>
						<div className={clsx(styles.rowNoWrap, "text-xs text-lighter")}>
							<UserStack users={data.team.members} />
							{data.team.name}
						</div>
					</>
				),
			};
		}
		case "CALENDAR_EVENT_NEW": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<Link to={`/calendar/${data.eventId}`} className="font-bold">
							{data.name}
						</Link>{" "}
						was added to the calendar
					</>
				),
				body: (
					<div className={clsx(styles.inset, styles.rowNoWrap)}>
						<DateBlock at={data.startsAt} />
						<div className={styles.grow}>
							<div className="font-semi-bold">{data.name}</div>
							<div className="text-xs text-lighter">
								<DayTime at={data.startsAt} /> · by {data.actor.username}
							</div>
						</div>
						<div className={styles.row}>
							{data.tags.map((tag) => (
								<span key={tag} className={styles.pill}>
									{tag}
								</span>
							))}
						</div>
					</div>
				),
			};
		}
		case "COMEBACK": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> is back after{" "}
						<b>{breakText(data.breakDays)}</b> away
					</>
				),
				body: (
					<div className={styles.inset}>
						{data.tournament ? (
							<TournamentRow tournament={data.tournament} />
						) : null}
						<div className="text-xs text-lighter">
							{[
								data.setCount > 0
									? `${data.setCount} SendouQ ${data.setCount === 1 ? "set" : "sets"}`
									: null,
								data.tournamentCount > 0
									? `${data.tournamentCount} ${data.tournamentCount === 1 ? "tournament" : "tournaments"}`
									: null,
							]
								.filter(Boolean)
								.join(" and ")}{" "}
							since coming back
						</div>
					</div>
				),
			};
		}
		case "FIRST_TIME": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				// xxx: use the pronoun from the user's profile instead of "their"
				line:
					data.source === "TOURNAMENT" ? (
						<>
							<UserName user={data.actor} /> played their{" "}
							<b>first tournament</b>
						</>
					) : (
						<>
							<UserName user={data.actor} /> played their{" "}
							<b>first SendouQ set</b>
						</>
					),
				body:
					data.source === "TOURNAMENT" ? (
						<div className={clsx(styles.inset, styles.rowNoWrap)}>
							<TournamentRow tournament={data.tournament ?? undefined} />
							{data.placement !== null ? (
								<span className={styles.placing}>
									{ordinalPlacement(data.placement)}
									<span className="text-xs text-lighter">
										/{data.participantCount}
									</span>
								</span>
							) : null}
						</div>
					) : (
						<div className={clsx(styles.inset, styles.rowNoWrap)}>
							<span className={styles.bigScore}>{data.setCount}</span>
							<span className="text-xs text-lighter">
								{data.setCount === 1 ? "set" : "sets"} played so far
							</span>
						</div>
					),
			};
		}
		case "ANNOUNCEMENT": {
			const { data } = item;
			return {
				avatar: <NavIconAvatar navIcon={data.navIcon} />,
				line: <b>{data.title}</b>,
				body: <div className="text-sm">{data.text}</div>,
				href: data.href,
			};
		}
		case "SITE_MILESTONE": {
			const { data } = item;
			const milestone = <b>{groupedNumber(data.milestone)}</b>;
			return {
				avatar: <LogoAvatar url={null} name="sendou.ink" />,
				line:
					data.total === "USERS" ? (
						<>sendou.ink now has {milestone} users</>
					) : data.total === "SQ_SETS" ? (
						<>{milestone} SendouQ sets have been played</>
					) : data.total === "TOURNAMENTS" ? (
						<>{milestone} tournaments have been hosted on sendou.ink</>
					) : (
						<>{milestone} art pieces have been shared on sendou.ink</>
					),
				body: (
					<div className={clsx(styles.hero, styles.heroAccent)}>
						<div className={styles.rowNoWrap}>
							<Image
								path={navIconUrl(SITE_MILESTONE_ICONS[data.total])}
								alt=""
								size={40}
							/>
							<span className={styles.bigScore}>
								{groupedNumber(data.milestone)}
							</span>
						</div>
						<div className="text-xs text-lighter">Thanks for being here!</div>
					</div>
				),
			};
		}
		case "FEATURE_SPOTLIGHT": {
			const { data } = item;
			return {
				avatar: <NavIconAvatar navIcon={data.navIcon} />,
				line: (
					<>
						<b>Did you know?</b> {data.title}
					</>
				),
				body: <div className="text-sm">{data.text}</div>,
				href: data.href,
			};
		}
		case "INSTALL_APP": {
			return {
				avatar: <LogoAvatar url={null} name="sendou.ink" />,
				line: <b>Get the sendou.ink app</b>,
				body: <InstallAppBody />,
			};
		}
		default:
			return null;
	}
}

function rotationTypeLabel(type: "X" | "SERIES" | "OPEN") {
	if (type === "X") return "X Battle";

	return `Anarchy ${type === "SERIES" ? "Series" : "Open"}`;
}

const SITE_MILESTONE_ICONS = {
	USERS: "u",
	SQ_SETS: "sendouq",
	TOURNAMENTS: "medal",
	ART: "art",
} as const;

function breakText(days: number) {
	if (days < 60) return `${days} days`;

	const months = Math.round(days / 30);
	if (months < 18) return `${months} months`;

	return `${Math.round(days / 365)} years`;
}

function InstallAppBody() {
	const installState = usePromptInstallState();

	return (
		<div className={styles.inset}>
			<div className="text-sm">
				Add sendou.ink to your home screen for quick access
				{installState === "hidden" ? " from your browser's menu." : "."}
			</div>
			{installState !== "hidden" ? (
				<InstallAction installState={installState} />
			) : null}
		</div>
	);
}
