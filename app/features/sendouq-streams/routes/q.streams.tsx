import type { MetaFunction } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { TierImage, WeaponImage } from "~/components/Image";
import { Main } from "~/components/Main";
import { UserIcon } from "~/components/icons/User";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { useIsMounted } from "~/hooks/useIsMounted";
import { twitchThumbnailUrlToSrc } from "~/modules/twitch/utils";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { FAQ_PAGE, sendouQMatchPage, twitchUrl, userPage } from "~/utils/urls";
import { cachedStreams } from "../core/streams.server";

import "~/features/sendouq/q.css";

export const handle: SendouRouteHandle = {
	i18n: ["q"],
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "SendouQ - Streams",
		description: "Streams of SendouQ matches in progress.",
		location: args.location,
	});
};

export const loader = async () => {
	return {
		streams: await cachedStreams(),
	};
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
			<Main className="text-lighter text-lg font-bold text-center">
				{t("q:streams.noStreams")}
				{ownStreamNote}
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
								<Link
									to={userPage(streamedMatch.user)}
									className="q-stream__stream__user-container"
								>
									<Avatar size="xxs" user={streamedMatch.user} />{" "}
									{streamedMatch.user.username}
								</Link>
								<div className="stack horizontal sm">
									{streamedMatch.weaponSplId ? (
										<div className="q-stream__info-circle">
											<WeaponImage
												weaponSplId={streamedMatch.weaponSplId}
												size={24}
												variant="build"
											/>
										</div>
									) : null}
									{streamedMatch.tier ? (
										<div className="q-stream__info-circle">
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
								<div className="q-stream__stream__viewer-count">
									<UserIcon />
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
	const isMounted = useIsMounted();
	useAutoRerender();

	if (!isMounted) return null;

	const minutesAgo = Math.floor((startedAt.getTime() - Date.now()) / 1000 / 60);
	const formatter = new Intl.RelativeTimeFormat(i18n.language, {
		style: "short",
	});

	return (
		<span className="text-lighter">
			{formatter.format(minutesAgo, "minute")}
		</span>
	);
}
