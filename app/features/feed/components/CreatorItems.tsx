import clsx from "clsx";
import { Play } from "lucide-react";
import * as React from "react";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { BuildCard } from "~/components/BuildCard";
import { ModeImage, StageImage, WeaponImage } from "~/components/Image";
import { userArtPage } from "~/features/art/art-urls";
import { BigImageDialog } from "~/features/art/components/ArtGrid";
import { smallImageFileName, vodVideoPage } from "~/utils/urls";
import type { FeedItem } from "../core/FeedItems.server";
import type { FeedItemContent } from "./FeedItemCard";
import { LogoAvatar, UserName } from "./FeedParts";
import styles from "./FeedParts.module.css";

export function creatorItemContent(item: FeedItem): FeedItemContent | null {
	switch (item.type) {
		case "ART_NEW": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> posted{" "}
						<Link to={userArtPage(data.actor)}>
							{data.count} new {data.count === 1 ? "piece" : "pieces"}
						</Link>
					</>
				),
				body: (
					<>
						<ArtGallery pieces={data.pieces} />
						{data.description ? (
							<div className="text-sm">{data.description}</div>
						) : null}
					</>
				),
				reactionCount: 31,
			};
		}
		case "ART_TAGGED": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> tagged{" "}
						<UserName user={data.tagged} /> in art
					</>
				),
				body: (
					<>
						<ArtGallery pieces={data.pieces} isSmall={false} />
						{data.description ? (
							<div className="text-sm">{data.description}</div>
						) : null}
					</>
				),
				reactionCount: 17,
			};
		}
		case "ART_COMMISSIONS": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> opened commissions
					</>
				),
				body: (
					<>
						<ArtGallery pieces={data.pieces} />
						<div className={clsx(styles.quote, "text-xs")}>{data.text}</div>
					</>
				),
			};
		}
		case "BUILD_NEW":
		case "BUILD_FOR_YOU": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line:
					item.type === "BUILD_FOR_YOU" ? (
						<>
							<UserName user={data.actor} /> ({data.peakXp} XP) posted a build
							for a weapon you play
						</>
					) : (
						<>
							<UserName user={data.actor} /> published a build:{" "}
							<b>{data.build.title}</b>
						</>
					),
				body: (
					<div className={styles.buildCard}>
						<BuildCard
							build={data.build}
							owner={{ ...data.actor, plusTier: null }}
							showOwner={false}
						/>
					</div>
				),
				reactionCount: 2,
			};
		}
		case "VOD_NEW": {
			const { data } = item;
			return {
				avatar: <LogoAvatar url={null} name={data.title} />,
				line: (
					<>
						New {data.type.toLowerCase()} VoD:{" "}
						<Link to={vodVideoPage(data.videoId)} className="font-bold">
							{data.title}
						</Link>
					</>
				),
				body: (
					<>
						<div className={styles.thumb}>
							<img
								src={`https://i.ytimg.com/vi/${data.youtubeId}/mqdefault.jpg`}
								alt=""
								loading="lazy"
							/>
							<span className={styles.thumbPlay}>
								<Play size={22} fill="currentColor" />
							</span>
							<span className={clsx(styles.thumbTag, styles.pill)}>
								{data.matchCount} games
							</span>
						</div>
						<div className={clsx(styles.row, styles.between)}>
							<div className={styles.row}>
								{data.players.map((player, i) => (
									<span key={i} className={styles.rowNoWrap}>
										{player.user ? (
											<Avatar user={player.user} size="xxxsm" />
										) : null}
										<span className="text-xs">
											{player.user?.username ?? player.name}
										</span>
										<WeaponImage
											weaponSplId={player.weaponSplId}
											variant="build"
											size={22}
										/>
									</span>
								))}
							</div>
							<div className={styles.rowNoWrap}>
								{data.modes.map((mode) => (
									<ModeImage key={mode} mode={mode} size={18} />
								))}
							</div>
						</div>
					</>
				),
			};
		}
		case "XRANK_TOP_500": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> placed <b>#{data.rank}</b> in X Rank
					</>
				),
				body: (
					<div className={clsx(styles.hero, styles.heroAccent, styles.heroRow)}>
						<WeaponImage
							weaponSplId={data.weaponSplId}
							variant="build"
							size={44}
						/>
						<div className={styles.grow}>
							<div className={styles.bigScore}>#{data.rank}</div>
							<div className="text-xs text-lighter">
								{data.region === "WEST" ? "Takoroka" : "Tentatek"} ·{" "}
								{data.month}/{data.year}
							</div>
						</div>
						<div>
							<div className="font-bold">{data.power.toFixed(1)}</div>
							<div className="text-xs text-lighter">X Power</div>
						</div>
						<ModeImage mode={data.mode} size={24} />
					</div>
				),
				reactionCount: 19,
			};
		}
		case "SCANNER_SCORECARD": {
			const { data } = item;
			return {
				avatar: <Avatar user={data.actor} size="xs" />,
				line: (
					<>
						<UserName user={data.actor} /> scanned a match
					</>
				),
				body: (
					<>
						<div className={clsx(styles.row, styles.between)}>
							<span className={styles.code}>{data.replayCode}</span>
							<span className={styles.rowNoWrap}>
								{data.mode ? <ModeImage mode={data.mode} size={20} /> : null}
								{data.stageId !== null ? (
									<StageImage
										stageId={data.stageId}
										width={64}
										className={styles.logo}
									/>
								) : null}
								<span
									className={clsx(
										styles.pill,
										data.isWin ? "text-success" : "text-error",
									)}
								>
									{data.isWin ? "WIN" : "LOSS"}
								</span>
							</span>
						</div>
						<div className={styles.tableWrap}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th />
										<th>Player</th>
										<th className={styles.numeric}>K/A</th>
										<th className={styles.numeric}>D</th>
										<th className={styles.numeric}>Sp</th>
										<th className={styles.numeric}>Paint</th>
									</tr>
								</thead>
								<tbody>
									{data.teams.flatMap((team, teamIndex) =>
										team.map((player, i) => (
											<tr
												key={`${teamIndex}-${i}`}
												className={clsx({
													[styles.highlightRow]: player.isPov,
												})}
											>
												<td>
													{player.weaponId !== null ? (
														<WeaponImage
															weaponSplId={player.weaponId}
															variant="build"
															size={22}
														/>
													) : null}
												</td>
												<td className={styles.ellipsis}>
													{player.name ?? "?"}
												</td>
												<td className={styles.numeric}>{player.ka ?? "–"}</td>
												<td className={styles.numeric}>{player.d ?? "–"}</td>
												<td className={styles.numeric}>{player.s ?? "–"}</td>
												<td className={styles.numeric}>
													{player.paint ?? "–"}
												</td>
											</tr>
										)),
									)}
								</tbody>
							</table>
						</div>
					</>
				),
			};
		}
		default:
			return null;
	}
}

function ArtGallery({
	pieces,
	isSmall = true,
}: {
	pieces: Array<{ url: string; description: string | null; createdAt: number }>;
	isSmall?: boolean;
}) {
	const [bigIndex, setBigIndex] = React.useState<number | null>(null);
	const bigPiece = bigIndex !== null ? pieces[bigIndex] : null;

	return (
		<div
			className={clsx(styles.gallery, {
				[styles.galleryOne]: pieces.length === 1,
			})}
		>
			{pieces.map((piece, i) => (
				<button
					key={piece.url}
					type="button"
					className={styles.galleryButton}
					onClick={() => setBigIndex(i)}
					aria-label="Open art"
				>
					<img
						src={isSmall ? smallImageFileName(piece.url) : piece.url}
						alt=""
						loading="lazy"
					/>
				</button>
			))}
			{bigPiece && bigIndex !== null ? (
				<BigImageDialog
					art={bigPiece}
					close={() => setBigIndex(null)}
					navigation={{
						index: bigIndex,
						count: pieces.length,
						onChange: setBigIndex,
					}}
				/>
			) : null}
		</div>
	);
}
