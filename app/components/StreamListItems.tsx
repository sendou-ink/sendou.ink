import { isToday, isTomorrow } from "date-fns";
import { Bookmark } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import type { SidebarStream } from "~/features/core/streams/streams.server";
import type { LanguageCode } from "~/modules/i18n/config";
import { databaseTimestampToDate, formatDistanceToNow } from "~/utils/dates";
import { navIconUrl } from "~/utils/urls";
import { Image } from "./Image";
import { ListLink } from "./SideNav";
import styles from "./StreamListItems.module.css";
import { TierPill } from "./TierPill";

export function StreamListItems({
	streams,
	onClick,
	isLoggedIn,
}: {
	streams: SidebarStream[];
	onClick?: () => void;
	isLoggedIn?: boolean;
}) {
	const { t, i18n } = useTranslation(["front"]);

	const formatRelativeDate = (timestamp: number) => {
		const date = new Date(timestamp * 1000);
		const timeStr = date.toLocaleTimeString(i18n.language, {
			hour: "numeric",
			minute: "2-digit",
		});

		if (isToday(date)) {
			const rtf = new Intl.RelativeTimeFormat(i18n.language, {
				numeric: "auto",
			});
			const dayStr = rtf.format(0, "day");
			return `${dayStr.charAt(0).toUpperCase() + dayStr.slice(1)}, ${timeStr}`;
		}
		if (isTomorrow(date)) {
			const rtf = new Intl.RelativeTimeFormat(i18n.language, {
				numeric: "auto",
			});
			const dayStr = rtf.format(1, "day");
			return `${dayStr.charAt(0).toUpperCase() + dayStr.slice(1)}, ${timeStr}`;
		}

		return date.toLocaleDateString(i18n.language, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	};

	return (
		<>
			{streams.map((stream, i) => {
				const startsAtDate = databaseTimestampToDate(stream.startsAt);
				const isUpcoming = startsAtDate.getTime() > Date.now();
				const prevStream = streams.at(i - 1);
				const prevIsLive =
					prevStream &&
					databaseTimestampToDate(prevStream.startsAt).getTime() <= Date.now();
				const showUpcomingDivider = isUpcoming && prevIsLive;

				return (
					<React.Fragment key={stream.id}>
						{showUpcomingDivider ? (
							<div className={styles.upcomingDivider}>
								{t("front:sideNav.streams.upcoming")}
							</div>
						) : null}
						<ListLink
							to={stream.url}
							imageUrl={stream.imageUrl}
							overlayIconUrl={stream.overlayIconUrl}
							subtitle={
								stream.peakXp ? (
									<span className={styles.xpSubtitle}>
										<Image
											path={navIconUrl("xsearch")}
											alt=""
											className={styles.xpIcon}
										/>
										{stream.peakXp}
									</span>
								) : stream.subtitle ? (
									stream.subtitle
								) : isUpcoming ? (
									formatRelativeDate(stream.startsAt)
								) : (
									formatDistanceToNow(startsAtDate, {
										addSuffix: true,
										language: i18n.language as LanguageCode,
									})
								)
							}
							badge={
								!isUpcoming ? (
									"LIVE"
								) : (
									<div className={styles.badgeRow}>
										{isLoggedIn && stream.id.startsWith("upcoming-") ? (
											<SaveTournamentStreamButton
												tournamentId={Number(
													stream.id.replace("upcoming-", ""),
												)}
											/>
										) : null}
										{streamTierBadge(stream)}
									</div>
								)
							}
							onClick={onClick}
						>
							{stream.name}
						</ListLink>
					</React.Fragment>
				);
			})}
		</>
	);
}

// xxx: show checked in checkmark for saved tournaments
// xxx: reload sidebar data after saving tournament
function SaveTournamentStreamButton({
	tournamentId,
}: {
	tournamentId: number;
}) {
	const fetcher = useFetcher();

	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		fetcher.submit(
			{ _action: "SAVE_TOURNAMENT" },
			{ method: "post", action: `/to/${tournamentId}/register` },
		);
	};

	return (
		<button
			type="button"
			className={styles.saveIconButton}
			title="Save"
			onClick={handleClick}
		>
			<Bookmark size={14} />
		</button>
	);
}

function streamTierBadge(stream: SidebarStream): React.ReactNode {
	const tier = stream.tier ?? stream.tentativeTier;
	if (!tier) return undefined;

	return (
		<div className={styles.tierBadge}>
			<TierPill
				tier={tier}
				isTentative={!stream.tier && !!stream.tentativeTier}
			/>
		</div>
	);
}
