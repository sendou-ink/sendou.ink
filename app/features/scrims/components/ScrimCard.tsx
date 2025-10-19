import { Link } from "@remix-run/react";
import { formatDistance } from "date-fns";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Image } from "~/components/Image";
import { ArrowUpOnSquareIcon } from "~/components/icons/ArrowUpOnSquare";
import { UsersIcon } from "~/components/icons/Users";
import TimePopover from "~/components/TimePopover";
import { databaseTimestampToDate } from "~/utils/dates";
import { modeImageUrl, userPage } from "~/utils/urls";
import { userSubmittedImage } from "~/utils/urls-img";
import type { ScrimPost } from "../scrims-types";
import { formatFlexTimeDisplay } from "../scrims-utils";
import styles from "./ScrimCard.module.css";

interface ScrimPostCardProps {
	post: ScrimPost;
	action?: "DELETE" | "REQUEST" | "VIEW_REQUEST";
	onActionClick?: () => void;
}

export function ScrimPostCard({
	post,
	action,
	onActionClick,
}: ScrimPostCardProps) {
	const { t } = useTranslation(["scrims"]);

	const owner = post.users.find((user) => user.isOwner) ?? post.users[0];
	const isPickup = !post.team?.name;
	const teamName = post.team?.name ?? owner.username;

	const flexTimeDisplay = post.rangeEnd
		? formatFlexTimeDisplay(post.at, post.rangeEnd)
		: null;

	return (
		<div className={styles.card}>
			<div className={styles.header}>
				<div className={styles.avatarContainer}>
					<ScrimTeamAvatar
						teamAvatarUrl={post.team?.avatarUrl}
						teamName={teamName}
						owner={owner}
					/>
				</div>
				<h3 className={styles.teamName}>
					{isPickup ? (
						<>
							<span className={styles.pickupLabel}>{t("scrims:pickupBy")}</span>
							<span>{owner.username}</span>
						</>
					) : (
						teamName
					)}
				</h3>
				<div className={styles.usersIconContainer}>
					<ScrimTeamMembersPopover users={post.users} />
				</div>
			</div>

			<div className={styles.infoRow}>
				<ScrimInfoItem label="Start">
					<ScrimStartTimeDisplay
						isScheduledForFuture={post.isScheduledForFuture}
						startTimestamp={post.at}
						createdAtTimestamp={post.createdAt}
					/>
				</ScrimInfoItem>

				{flexTimeDisplay ? (
					<ScrimInfoItem label="Flex">{flexTimeDisplay}</ScrimInfoItem>
				) : null}

				<ScrimInfoItem label="Modes">
					<Image
						path={modeImageUrl("SZ")}
						alt="Splat Zones"
						width={18}
						height={18}
					/>
				</ScrimInfoItem>

				{post.divs ? (
					<ScrimInfoItem label="Div">
						{post.divs.max}-{post.divs.min}
					</ScrimInfoItem>
				) : null}
			</div>

			{post.text ? <ScrimExpandableText text={post.text} /> : null}

			<div className={styles.footer}>
				<ScrimActionButtons action={action} onActionClick={onActionClick} />
			</div>
		</div>
	);
}

function ScrimTeamAvatar({
	teamAvatarUrl,
	teamName,
	owner,
}: {
	teamAvatarUrl: string | null | undefined;
	teamName: string;
	owner: ScrimPost["users"][number];
}) {
	if (teamAvatarUrl) {
		return (
			<Avatar
				size="xs"
				url={userSubmittedImage(teamAvatarUrl)}
				alt={teamName}
			/>
		);
	}

	return <Avatar size="xs" user={owner} alt={owner.username} />;
}

function ScrimTeamMembersPopover({ users }: { users: ScrimPost["users"] }) {
	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					icon={<UsersIcon className={styles.usersIcon} />}
				/>
			}
		>
			<div className="stack md">
				{users.map((user) => (
					<Link
						to={userPage(user)}
						key={user.id}
						className="stack horizontal sm"
					>
						<Avatar size="xxs" user={user} />
						{user.username}
					</Link>
				))}
			</div>
		</SendouPopover>
	);
}

function ScrimStartTimeDisplay({
	isScheduledForFuture,
	startTimestamp,
	createdAtTimestamp,
}: {
	isScheduledForFuture: boolean;
	startTimestamp: number;
	createdAtTimestamp: number;
}) {
	const { t } = useTranslation(["scrims"]);

	if (!isScheduledForFuture) {
		return t("scrims:now");
	}

	const startTime = databaseTimestampToDate(startTimestamp);
	const timePopoverFooterText = t("scrims:postModal.footer", {
		time: formatDistance(
			databaseTimestampToDate(createdAtTimestamp),
			new Date(),
			{
				addSuffix: true,
			},
		),
	});

	return (
		<TimePopover
			time={startTime}
			options={{
				hour: "numeric",
				minute: "numeric",
			}}
			underline={false}
			footerText={timePopoverFooterText}
		/>
	);
}

function ScrimInfoItem({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className={styles.infoItem}>
			<div className={styles.infoLabel}>{label}</div>
			<div className={styles.infoValue}>{children}</div>
		</div>
	);
}

function ScrimExpandableText({ text }: { text: string }) {
	const { t } = useTranslation(["common"]);
	const [isExpanded, setIsExpanded] = useState(false);

	const shouldTruncate = text.length > 50;
	const displayText =
		shouldTruncate && !isExpanded ? `${text.slice(0, 50)}...` : text;

	return (
		<div className={styles.textContent}>
			<span>{displayText}</span>
			{shouldTruncate ? (
				<button
					type="button"
					onClick={() => setIsExpanded(!isExpanded)}
					className={styles.expandButton}
				>
					{isExpanded
						? t("common:actions.showLess")
						: t("common:actions.showMore")}
				</button>
			) : null}
		</div>
	);
}

function ScrimActionButtons({
	action,
	onActionClick,
}: {
	action: ScrimPostCardProps["action"];
	onActionClick?: () => void;
}) {
	const { t } = useTranslation(["scrims", "common"]);

	if (!action || !onActionClick) {
		return null;
	}

	if (action === "REQUEST") {
		return (
			<SendouButton
				size="small"
				onPress={onActionClick}
				icon={<ArrowUpOnSquareIcon />}
			>
				{t("scrims:actions.request")}
			</SendouButton>
		);
	}

	return (
		<SendouButton size="small" variant="destructive" onPress={onActionClick}>
			{t("common:actions.delete")}
		</SendouButton>
	);
}
