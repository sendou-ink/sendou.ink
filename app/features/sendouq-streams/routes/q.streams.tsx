import { User } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { EmptyState } from "~/components/EmptyState";
import { TierImage, WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { UserLink } from "~/components/UserLink";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { useHydrated } from "~/hooks/useHydrated";
import { twitchThumbnailUrlToSrc } from "~/modules/twitch/utils";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { FAQ_PAGE, sendouQMatchPage, twitchUrl } from "~/utils/urls";

import { loader } from "../loaders/q.streams.server";

export { loader };

import styles from "./q.streams.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["q"],
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "SendouQ - Streams",
		description: "Streams of SendouQ matches in progress.",
		image: ogPageImage("sendouq"),
		location: args.location,
	});
};

export default function SendouQStreamsPage() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();

	const ownStreamNote = (
		<div className="text-xs mt-4 font-body">
			{t("q:streams.ownStreamInfo")}{" "}
			<Link to={FAQ_PAGE}>{t("q:streams.ownStreamInfo.linkText")}</Link>
		</div>
	);

	if (data.streams.length === 0) {
		return (
			<Main>
				<EmptyState navItem="sendouq">
					{t("q:streams.noStreams")}
					{ownStreamNote}
				</EmptyState>
			</Main>
		);
	}

	return (
		<Main>
			<div className="stack horizontal lg flex-wrap justify-center">
				{data.streams.map((streamedMatch) => {
					return (
						<div key={streamedMatch.user.id} className="stack sm">
							<div className="stack horizontal justify-between items-end">
								<UserLink
									user={streamedMatch.user}
									className={styles.userContainer}
								/>
								<div className="stack horizontal sm">
									{streamedMatch.weaponSplId ? (
										<div className={styles.infoCircle}>
											<WeaponImage
												weaponSplId={streamedMatch.weaponSplId}
												size={24}
												variant="build"
											/>
										</div>
									) : null}
									{streamedMatch.tier ? (
										<div className={styles.infoCircle}>
											<TierImage tier={streamedMatch.tier} width={24} />
										</div>
									) : null}
								</div>
							</div>
							<a
								href={twitchUrl(streamedMatch.user.twitch)}
								target="_blank"
								rel="noreferrer"
							>
								<img
									alt=""
									src={twitchThumbnailUrlToSrc(
										streamedMatch.stream.thumbnailUrl,
									)}
									width={320}
									height={180}
								/>
							</a>
							<div className="stack horizontal justify-between">
								<div className="text-sm stack horizontal sm">
									<div>
										<Link to={sendouQMatchPage(streamedMatch.match.id)}>
											#{streamedMatch.match.id}
										</Link>
									</div>
									<RelativeStartTime
										startedAt={databaseTimestampToDate(
											streamedMatch.match.createdAt,
										)}
									/>
								</div>
								<div className={styles.viewerCount}>
									<User />
									{streamedMatch.stream.viewerCount}
								</div>
							</div>
						</div>
					);
				})}
			</div>
			{ownStreamNote}
		</Main>
	);
}

function RelativeStartTime({ startedAt }: { startedAt: Date }) {
	const { i18n } = useTranslation();
	const isHydrated = useHydrated();
	const now = useAutoRerender();

	if (!isHydrated) return null;

	const minutesAgo = Math.floor(
		(startedAt.getTime() - now.getTime()) / 1000 / 60,
	);
	const formatter = new Intl.RelativeTimeFormat(i18n.language, {
		style: "short",
	});

	return (
		<span className="text-lighter">
			{formatter.format(minutesAgo, "minute")}
		</span>
	);
}
