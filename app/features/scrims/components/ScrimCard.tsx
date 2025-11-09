import { Form, Link } from "@remix-run/react";
import clsx from "clsx";
import { formatDistance } from "date-fns";
import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouPopover } from "~/components/elements/Popover";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { ModeImage } from "~/components/Image";
import { ArrowDownOnSquareIcon } from "~/components/icons/ArrowDownOnSquare";
import { ArrowUpOnSquareIcon } from "~/components/icons/ArrowUpOnSquare";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { EyeSlashIcon } from "~/components/icons/EyeSlash";
import { SpeechBubbleFilledIcon } from "~/components/icons/SpeechBubbleFilled";
import { TrashIcon } from "~/components/icons/Trash";
import { UsersIcon } from "~/components/icons/Users";
import TimePopover from "~/components/TimePopover";
import { useUser } from "~/features/auth/core/user";
import type { ModeShort } from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import { scrimPage, tournamentRegisterPage, userPage } from "~/utils/urls";
import type { ScrimPost, ScrimPostRequest } from "../scrims-types";
import { formatFlexTimeDisplay } from "../scrims-utils";
import styles from "./ScrimCard.module.css";
import { ScrimRequestModal } from "./ScrimRequestModal";

interface ScrimPostCardProps {
	post: ScrimPost;
	action?: "DELETE" | "REQUEST" | "VIEW_REQUEST" | "CONTACT";
	isFilteredOut?: boolean;
}

export function ScrimPostCard({
	post,
	action,
	isFilteredOut,
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
				<div className={styles.rightIconsContainer}>
					{post.isPrivate ? <ScrimVisibilityPopover /> : null}
					<ScrimTeamMembersPopover users={post.users} />
				</div>
			</div>

			<div className={styles.infoRow}>
				<ScrimInfoItem label="Start">
					<ScrimStartTimeDisplay
						isScheduledForFuture={post.isScheduledForFuture}
						startTimestamp={post.at}
						createdAtTimestamp={post.createdAt}
						canceled={post.canceled}
					/>
				</ScrimInfoItem>

				{flexTimeDisplay ? (
					<ScrimInfoItem label="Flex">{flexTimeDisplay}</ScrimInfoItem>
				) : null}
				{post.divs ? (
					<ScrimInfoItem label="Div">
						{post.divs.max === post.divs.min
							? post.divs.max
							: `${post.divs.min}-${post.divs.max}`}
					</ScrimInfoItem>
				) : null}

				{post.maps || post.mapsTournament ? (
					<ScrimInfoItem label="Modes">
						{post.mapsTournament ? (
							<ScrimTournamentPopover tournament={post.mapsTournament} />
						) : (
							getModesList(post.maps!).map((mode) => (
								<ModeImage key={mode} mode={mode} size={18} />
							))
						)}
					</ScrimInfoItem>
				) : null}
			</div>

			{post.text ? <ScrimExpandableText text={post.text} /> : null}

			<div
				className={clsx(styles.footer, isFilteredOut && styles.filteredFooter)}
			>
				<ScrimActionButtons action={action} post={post} key={action} />
			</div>
		</div>
	);
}

function getModesList(maps: string): ModeShort[] {
	if (maps === "SZ") {
		return ["SZ"];
	}
	if (maps === "RANKED") {
		return ["SZ", "TC", "RM", "CB"];
	}
	return ["TW", "SZ", "TC", "RM", "CB"];
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
		return <Avatar size="xs" url={teamAvatarUrl} alt={teamName} />;
	}

	return <Avatar size="xs" user={owner} alt={owner.username} />;
}

function ScrimVisibilityPopover() {
	const { t } = useTranslation(["scrims"]);
	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					icon={<EyeSlashIcon className={styles.usersIcon} />}
					data-testid="limited-visibility-popover"
				/>
			}
		>
			{t("scrims:limitedVisibility")}
		</SendouPopover>
	);
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

function ScrimTournamentPopover({
	tournament,
}: {
	tournament: NonNullable<ScrimPost["mapsTournament"]>;
}) {
	return (
		<SendouPopover
			trigger={
				<SendouButton
					variant="minimal"
					data-testid="tournament-popover-trigger"
				>
					<Avatar
						size="xxxsm"
						url={tournament.avatarUrl}
						alt={tournament.name}
					/>
				</SendouButton>
			}
		>
			<div className="stack sm text-center">
				<Link
					to={`${tournamentRegisterPage(tournament.id)}?tab=description`}
					className="text-theme text-xxs"
				>
					{tournament.name}
				</Link>
			</div>
		</SendouPopover>
	);
}

function ScrimStartTimeDisplay({
	isScheduledForFuture,
	startTimestamp,
	createdAtTimestamp,
	canceled,
}: {
	isScheduledForFuture: boolean;
	startTimestamp: number;
	createdAtTimestamp: number;
	canceled: ScrimPost["canceled"];
}) {
	const { t } = useTranslation(["scrims"]);

	if (!isScheduledForFuture) {
		return canceled ? (
			<div className={styles.canceledContainer}>
				<span className={styles.strikethrough}>{t("scrims:now")}</span>
				<span className={styles.canceledLabel}>Canceled</span>
			</div>
		) : (
			t("scrims:now")
		);
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

	const timeDisplay = (
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

	return canceled ? (
		<div className={styles.canceledContainer}>
			<span className={styles.strikethrough}>{timeDisplay}</span>
			<span className={styles.canceledLabel}>Canceled</span>
		</div>
	) : (
		timeDisplay
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

function ScrimExpandableText({
	text,
	maxBeforeTruncate = 50,
}: {
	text: string;
	maxBeforeTruncate?: number;
}) {
	const { t } = useTranslation(["common"]);
	const [isExpanded, setIsExpanded] = useState(false);

	const shouldTruncate = text.length > maxBeforeTruncate;
	const displayText =
		shouldTruncate && !isExpanded
			? `${text.slice(0, maxBeforeTruncate)}...`
			: text;

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
	post,
}: {
	action: ScrimPostCardProps["action"];
	post: ScrimPost;
}) {
	const { t, i18n } = useTranslation(["scrims", "common"]);
	const user = useUser();
	const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
	const [isViewRequestModalOpen, setIsViewRequestModalOpen] = useState(false);

	if (!action) {
		return null;
	}

	if (action === "REQUEST") {
		return (
			<>
				<SendouButton
					size="small"
					onPress={() => setIsRequestModalOpen(true)}
					icon={<ArrowUpOnSquareIcon />}
					data-testid="request-scrim-button"
				>
					{t("scrims:actions.request")}
				</SendouButton>
				{isRequestModalOpen ? (
					<ScrimRequestModal
						post={post}
						close={() => setIsRequestModalOpen(false)}
					/>
				) : null}
			</>
		);
	}

	if (action === "VIEW_REQUEST") {
		const userRequest = post.requests.find((request) =>
			request.users.some((rUser) => user?.id === rUser.id),
		);

		return (
			<>
				<SendouButton
					size="small"
					onPress={() => setIsViewRequestModalOpen(true)}
					variant="outlined"
					icon={<ArrowDownOnSquareIcon />}
					data-testid="view-request-button"
				>
					{t("scrims:actions.viewRequest")}
				</SendouButton>
				{isViewRequestModalOpen && userRequest ? (
					<SendouDialog
						heading={t("scrims:cancelRequestModal.title")}
						onClose={() => setIsViewRequestModalOpen(false)}
					>
						<div className="stack md">
							{userRequest.message ? (
								<div>
									<div className="text-sm font-semi-bold mb-1">
										{t("scrims:requestModal.message.label")}
									</div>
									<div className="text-lighter">{userRequest.message}</div>
								</div>
							) : null}
							{userRequest.at ? (
								<div>
									<div className="text-sm font-semi-bold mb-1">
										{t("scrims:requestModal.at.label")}
									</div>
									<div className="text-lighter">
										{databaseTimestampToDate(userRequest.at).toLocaleString(
											i18n.language,
											{
												hour: "numeric",
												minute: "2-digit",
												day: "numeric",
												month: "long",
											},
										)}
									</div>
								</div>
							) : null}
							<Form method="post">
								<input
									type="hidden"
									name="scrimPostRequestId"
									value={userRequest.id}
								/>
								<input type="hidden" name="_action" value="CANCEL_REQUEST" />
								<SendouButton
									type="submit"
									variant="destructive"
									icon={<TrashIcon />}
								>
									{t("common:actions.cancel")}
								</SendouButton>
							</Form>
						</div>
					</SendouDialog>
				) : null}
			</>
		);
	}

	if (action === "CONTACT") {
		return (
			<LinkButton
				to={scrimPage(post.id)}
				size="small"
				icon={<SpeechBubbleFilledIcon />}
			>
				{t("scrims:actions.contact")}
			</LinkButton>
		);
	}

	return (
		<FormWithConfirm
			dialogHeading={t("scrims:deleteModal.title")}
			submitButtonText={t("common:actions.delete")}
			fields={[
				["scrimPostId", post.id],
				["_action", "DELETE_POST"],
			]}
		>
			<SendouButton size="small" variant="destructive" icon={<TrashIcon />}>
				{t("common:actions.delete")}
			</SendouButton>
		</FormWithConfirm>
	);
}

interface ScrimRequestCardProps {
	request: ScrimPostRequest;
	postStartTime: number;
	canAccept: boolean;
	showFooter?: boolean;
}

export function ScrimRequestCard({
	request,
	postStartTime,
	canAccept,
	showFooter = true,
}: ScrimRequestCardProps) {
	const { t, i18n } = useTranslation(["scrims", "common"]);

	const owner = request.users.find((user) => user.isOwner) ?? request.users[0];
	const isPickup = !request.team?.name;
	const teamName = request.team?.name ?? owner.username;

	const confirmedTime = request.at
		? databaseTimestampToDate(request.at)
		: databaseTimestampToDate(postStartTime);

	return (
		<div className={clsx(styles.card, styles.requestCard)}>
			<div className={styles.header}>
				<div className={styles.avatarContainer}>
					<ScrimTeamAvatar
						teamAvatarUrl={request.team?.avatarUrl}
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
				<div className={styles.rightIconsContainer}>
					<ScrimTeamMembersPopover users={request.users} />
				</div>
			</div>

			{request.message ? (
				<ScrimExpandableText text={request.message} maxBeforeTruncate={100} />
			) : null}

			{showFooter ? (
				<div className={clsx(styles.footer, styles.requestFooter)}>
					{canAccept ? (
						<FormWithConfirm
							dialogHeading={t("scrims:acceptModal.title", {
								groupName: teamName,
							})}
							fields={[
								["scrimPostRequestId", request.id],
								["_action", "ACCEPT_REQUEST"],
							]}
							submitButtonVariant="primary"
							submitButtonText={t("common:actions.confirm")}
						>
							<SendouButton
								size="small"
								icon={<CheckmarkIcon />}
								data-testid="confirm-modal-trigger-button"
							>
								{t("scrims:acceptModal.confirmFor", {
									time: confirmedTime.toLocaleTimeString(i18n.language, {
										hour: "numeric",
										minute: "2-digit",
									}),
								})}
							</SendouButton>
						</FormWithConfirm>
					) : (
						<SendouPopover
							trigger={
								<SendouButton size="small">
									{t("scrims:acceptModal.confirmFor", {
										time: confirmedTime.toLocaleTimeString(i18n.language, {
											hour: "numeric",
											minute: "2-digit",
										}),
									})}
								</SendouButton>
							}
						>
							{t("scrims:acceptModal.prevented")}
						</SendouPopover>
					)}
				</div>
			) : null}
		</div>
	);
}
