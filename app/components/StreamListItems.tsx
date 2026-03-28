import { isToday, isTomorrow } from "date-fns";
import { Bookmark, BookmarkCheck } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import type { SidebarStream } from "~/features/core/streams/streams.server";
import { useHydrated } from "~/hooks/useHydrated";
import type { LanguageCode } from "~/modules/i18n/config";
import { databaseTimestampToDate, formatDistanceToNow } from "~/utils/dates";
import { navIconUrl, tournamentRegisterPage } from "~/utils/urls";
import { Image } from "./Image";
import { ListLink } from "./SideNav";
import styles from "./StreamListItems.module.css";
import { TierPill } from "./TierPill";

export function StreamListItems({
	streams,
	onClick,
	isLoggedIn,
	savedTournamentIds,
}: {
	streams: SidebarStream[];
	onClick?: () => void;
	isLoggedIn?: boolean;
	savedTournamentIds?: number[];
}) {
	const { t, i18n } = useTranslation(["front"]);
	const isHydrated = useHydrated();

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
				const tournamentId = stream.id.startsWith("upcoming-")
					? Number(stream.id.replace("upcoming-", ""))
					: null;

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
								) : !isHydrated ? (
									<span className="invisible">Placeholder</span>
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
										{isLoggedIn && tournamentId !== null ? (
											<SaveTournamentStreamButton
												tournamentId={tournamentId}
												isSaved={
													savedTournamentIds?.includes(tournamentId) ?? false
												}
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

function SaveTournamentStreamButton({
	tournamentId,
	isSaved,
}: {
	tournamentId: number;
	isSaved: boolean;
}) {
	const fetcher = useFetcher();

	const optimisticSaved =
		fetcher.formData?.get("_action") === "SAVE_TOURNAMENT"
			? true
			: fetcher.formData?.get("_action") === "UNSAVE_TOURNAMENT"
				? false
				: isSaved;

	const Icon = optimisticSaved ? BookmarkCheck : Bookmark;

	return (
		<fetcher.Form
			method="post"
			action={tournamentRegisterPage(tournamentId)}
			onClick={(e) => e.stopPropagation()}
		>
			<input
				type="hidden"
				name="_action"
				value={optimisticSaved ? "UNSAVE_TOURNAMENT" : "SAVE_TOURNAMENT"}
			/>
			<input type="hidden" name="revalidateRoot" value="true" />
			<button type="submit" className={styles.saveIconButton} title="Save">
				<Icon size={14} />
			</button>
		</fetcher.Form>
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
