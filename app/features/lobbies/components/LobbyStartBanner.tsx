import { differenceInSeconds } from "date-fns";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	IconBanner,
	MatchBannerContainer,
} from "~/components/match-page/MatchBanner";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { databaseTimestampToDate } from "~/utils/dates";
import * as LobbyState from "../core/LobbyState";
import { PLAYERS_PER_SET } from "../lobbies-constants";
import { useLobbyView } from "../lobbies-hooks";
import styles from "./LobbyStartBanner.module.css";

const SECONDS_PER_DAY = 24 * 60 * 60;

/** Before the room forms: time left until the start and when check-in opens or, once open, how many of those needed have checked in. */
export function LobbyStartBanner() {
	const { t } = useTranslation(["lobbies"]);
	const { data, joinInfo } = useLobbyView();
	const now = useAutoRerender("second");
	const formatDistanceToNow = useFormatDistanceToNow();
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "numeric",
	});
	const { formatter: dayTimeFormatter } = useDateTimeFormat({
		weekday: "short",
		hour: "numeric",
		minute: "numeric",
	});

	const secondsLeft = differenceInSeconds(
		databaseTimestampToDate(data.lobby.startsAt),
		now,
	);
	const checkedInCount = data.lobby.participants.filter(
		(participant) => participant.status === "CHECKED_IN",
	).length;

	return (
		<MatchBannerContainer>
			<IconBanner
				icon={<CalendarClock size={32} />}
				header={
					<span
						className={styles.countdown}
						data-testid="lobby-start-countdown"
						// the clock has moved on since the server rendered
						suppressHydrationWarning
					>
						{secondsLeft <= 0
							? t("lobbies:start.waitingForCheckIns")
							: t("lobbies:start.countdown", {
									time:
										secondsLeft >= SECONDS_PER_DAY
											? formatDistanceToNow(data.lobby.startsAt)
											: clockTime(secondsLeft),
								})}
					</span>
				}
				subtitle={
					data.status === "UPCOMING"
						? t("lobbies:start.checkInOpens", {
								time: (secondsLeft >= SECONDS_PER_DAY
									? dayTimeFormatter
									: timeFormatter
								).format(LobbyState.checkInOpensAt(data.lobby.startsAt)),
							})
						: t("lobbies:start.checkedIn", {
								count: checkedInCount,
								needed: PLAYERS_PER_SET,
							})
				}
				joinPool={joinInfo?.pool}
				joinPass={joinInfo?.pass}
				testId="lobby-start-banner"
			/>
		</MatchBannerContainer>
	);
}

function clockTime(totalSeconds: number) {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (value: number) => String(value).padStart(2, "0");

	return hours > 0
		? `${hours}:${pad(minutes)}:${pad(seconds)}`
		: `${minutes}:${pad(seconds)}`;
}
