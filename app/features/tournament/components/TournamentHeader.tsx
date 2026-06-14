import { Bookmark, BookmarkCheck, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useFetcher } from "react-router";
import * as R from "remeda";
import { Avatar } from "~/components/Avatar";
import { CopyToClipboardPopover } from "~/components/CopyToClipboardPopover";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { DiscordIcon } from "~/components/icons/Discord";
import TimePopover from "~/components/TimePopover";
import { useUser } from "~/features/auth/core/user";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { databaseTimestampToDate } from "~/utils/dates";
import {
	SENDOU_INK_BASE_URL,
	tournamentOrganizationPage,
	tournamentPage,
	userPage,
} from "~/utils/urls";
import { tournamentNameParts } from "../tournament-utils";
import styles from "./TournamentHeader.module.css";

export function TournamentHeader({ tournament }: { tournament: Tournament }) {
	const { name, subtext } = tournamentNameParts(tournament);

	const startTimes = R.uniqueBy(
		[
			tournament.ctx.startTime,
			...tournament.ctx.settings.bracketProgression
				.filter((b) => b.startTime)
				.map((b) => databaseTimestampToDate(b.startTime!)),
		],
		(date) => date.getTime(),
	);

	const currentYear = new Date().getFullYear();

	return (
		<header className={styles.header}>
			<div className={styles.identity}>
				<img
					src={tournament.ctx.logoUrl}
					alt=""
					className={styles.logo}
					width={125}
					height={125}
				/>
				<div className={styles.titleBlock}>
					<div className={styles.nameBlock}>
						<h1 className={styles.name}>{name}</h1>
						{subtext ? <div className={styles.subtext}>{subtext}</div> : null}
					</div>
					<OrganizerLink tournament={tournament} />
				</div>
			</div>
			<div className={styles.dates}>
				{startTimes.map((date) => (
					<TimePopover
						key={date.getTime()}
						date={date}
						options={{
							weekday: "long",
							day: "numeric",
							month: "long",
							year: date.getFullYear() !== currentYear ? "numeric" : undefined,
							hour: "numeric",
							minute: "numeric",
						}}
					/>
				))}
			</div>
		</header>
	);
}

export function TournamentHeaderActions({
	tournament,
	isSaved,
}: {
	tournament: Tournament;
	isSaved: boolean;
}) {
	return (
		<div className={styles.actions}>
			<SaveTournamentButton tournament={tournament} isSaved={isSaved} />
			{tournament.ctx.discordUrl ? (
				<LinkButton
					to={tournament.ctx.discordUrl}
					variant="outlined"
					size="small"
					shape="circle"
					isExternal
					icon={<DiscordIcon />}
					aria-label="Discord"
				/>
			) : null}
			<ShareTournamentButton tournament={tournament} />
		</div>
	);
}

function SaveTournamentButton({
	tournament,
	isSaved,
}: {
	tournament: Tournament;
	isSaved: boolean;
}) {
	const { t } = useTranslation(["common"]);
	const user = useUser();
	const fetcher = useFetcher();

	const teamMemberOf = tournament.teamMemberOfByUser(user);
	if (!user || tournament.hasStarted || teamMemberOf) return null;

	const pending = fetcher.formData?.get("_action");
	const displayedSaved =
		pending === "SAVE_TOURNAMENT"
			? true
			: pending === "UNSAVE_TOURNAMENT"
				? false
				: isSaved;

	return (
		<fetcher.Form method="post">
			<input
				type="hidden"
				name="_action"
				value={displayedSaved ? "UNSAVE_TOURNAMENT" : "SAVE_TOURNAMENT"}
			/>
			<SendouButton
				type="submit"
				variant="outlined"
				size="small"
				shape="circle"
				icon={displayedSaved ? <BookmarkCheck /> : <Bookmark />}
				aria-label={
					displayedSaved ? t("common:actions.unsave") : t("common:actions.save")
				}
			/>
		</fetcher.Form>
	);
}

function OrganizerLink({ tournament }: { tournament: Tournament }) {
	if (tournament.ctx.organization) {
		return (
			<Link
				to={tournamentOrganizationPage({
					organizationSlug: tournament.ctx.organization.slug,
					tournamentName: tournament.ctx.name,
				})}
				className={styles.organizer}
			>
				<Avatar
					url={tournament.ctx.organization.logoUrl ?? undefined}
					size="xxs"
				/>
				{tournament.ctx.organization.name}
			</Link>
		);
	}

	return (
		<Link to={userPage(tournament.ctx.author)} className={styles.organizer}>
			<Avatar user={tournament.ctx.author} size="xxs" />
			{tournament.ctx.author.username}
		</Link>
	);
}

function ShareTournamentButton({ tournament }: { tournament: Tournament }) {
	const { t } = useTranslation(["common"]);
	const url = `${SENDOU_INK_BASE_URL}${tournamentPage(tournament.ctx.id)}`;

	const handleShare = () => {
		navigator.share({ url });
	};

	if (
		typeof navigator !== "undefined" &&
		typeof navigator.share === "function"
	) {
		return (
			<SendouButton
				variant="outlined"
				size="small"
				shape="circle"
				icon={<Share2 />}
				onPress={handleShare}
				aria-label={t("common:actions.share")}
			/>
		);
	}

	return (
		<CopyToClipboardPopover
			url={url}
			trigger={
				<SendouButton
					variant="outlined"
					size="small"
					shape="circle"
					icon={<Share2 />}
					aria-label={t("common:actions.share")}
				/>
			}
		/>
	);
}
