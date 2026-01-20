import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouPopover } from "~/components/elements/Popover";
import { Image } from "~/components/Image";
import { AlertIcon } from "~/components/icons/Alert";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import TimePopover from "~/components/TimePopover";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { cancelScrimSchema } from "~/features/scrims/scrims-schemas";
import { resolveRoomPass } from "~/features/tournament-bracket/tournament-bracket-utils";
import { SendouForm } from "~/form/SendouForm";
import { SPLATTERCOLOR_SCREEN_ID } from "~/modules/in-game-lists/weapon-ids";
import { useHasPermission } from "~/modules/permissions/hooks";
import type { SerializeFrom } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { Avatar } from "../../../components/Avatar";
import { Main } from "../../../components/Main";
import { databaseTimestampToDate } from "../../../utils/dates";
import { logger } from "../../../utils/logger";
import {
	mapsPageWithMapPool,
	navIconUrl,
	scrimsPage,
	specialWeaponImageUrl,
	teamPage,
	userPage,
} from "../../../utils/urls";
import { ConnectedChat } from "../../chat/components/Chat";
import { action } from "../actions/scrims.$id.server";
import * as Scrim from "../core/Scrim";
import { loader } from "../loaders/scrims.$id.server";
import type { ScrimPost, ScrimPost as ScrimPostType } from "../scrims-types";
import styles from "./scrims.$id.module.css";
export { loader, action };

export const handle: SendouRouteHandle = {
	i18n: ["scrims", "q"],
	breadcrumb: () => ({
		imgPath: navIconUrl("scrims"),
		href: scrimsPage(),
		type: "IMAGE",
	}),
};

export default function ScrimPage() {
	const { t } = useTranslation(["q", "scrims", "common"]);
	const data = useLoaderData<typeof loader>();

	const allowedToCancel = useHasPermission(data.post, "CANCEL");
	const isCanceled = Boolean(data.post.canceled);
	const canCancel =
		allowedToCancel &&
		!isCanceled &&
		databaseTimestampToDate(data.post.at) > new Date();

	return (
		<Main className="stack lg">
			<div className="stack horizontal justify-between">
				<ScrimHeader />
				{canCancel && (
					<div>
						<SendouDialog
							trigger={
								<SendouButton size="small" variant="minimal-destructive">
									{t("common:actions.cancel")}
								</SendouButton>
							}
							heading={t("scrims:cancelModal.scrim.title")}
							showCloseButton
						>
							<CancelScrimForm />
						</SendouDialog>
					</div>
				)}
			</div>
			{data.post.canceled && (
				<div className="mx-auto">
					<Alert variation="WARNING">
						{t("scrims:alert.canceled", {
							user: data.post.canceled.byUser.username,
							reason: data.post.canceled.reason,
						})}
					</Alert>
				</div>
			)}
			<div className={styles.groupsContainer}>
				<GroupCard group={data.post} side="ALPHA" />
				<GroupCard group={data.post.requests[0]} side="BRAVO" />
			</div>
			<div className="stack horizontal lg justify-center">
				<InfoWithHeader
					header={t("q:match.password.short")}
					value={resolveRoomPass(data.post.id)}
				/>
				<InfoWithHeader
					header={t("q:match.pool")}
					value={Scrim.resolvePoolCode(data.post.id)}
				/>
				<ScreenBanIndicator />
				{data.post.maps || data.tournamentMapPool ? (
					<MapsLink
						maps={data.post.maps}
						tournamentMapPool={data.tournamentMapPool}
					/>
				) : null}
			</div>
			<ScrimChat />
		</Main>
	);
}

function CancelScrimForm() {
	return (
		<SendouForm
			schema={cancelScrimSchema}
			submitButtonTestId="cancel-scrim-submit"
		>
			{({ FormField }) => <FormField name="reason" />}
		</SendouForm>
	);
}

function ScrimHeader() {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();

	const acceptedRequest = data.post.requests.find((r) => r.isAccepted);
	const scrimTime = acceptedRequest?.at ?? data.post.at;

	return (
		<div className="line-height-tight" data-testid="match-header">
			<h2 className="text-lg">
				<TimePopover
					time={databaseTimestampToDate(scrimTime)}
					options={{
						weekday: "long",
						year: "numeric",
						month: "long",
						day: "numeric",
						hour: "numeric",
						minute: "numeric",
					}}
					className="text-left"
				/>
			</h2>
			<div className="text-lighter text-xs font-bold">
				{t("scrims:page.scheduledScrim")}
			</div>
		</div>
	);
}

function GroupCard({
	group,
	side,
}: {
	group: { users: ScrimPostType["users"]; team: ScrimPostType["team"] };
	side: "ALPHA" | "BRAVO";
}) {
	const { t } = useTranslation(["q"]);

	return (
		<div className="stack sm">
			<div className="stack horizontal justify-between">
				<div className="text-lighter text-xs">
					{side === "ALPHA"
						? t("q:match.sides.alpha")
						: t("q:match.sides.bravo")}
				</div>
				{group.team ? (
					<Link
						to={teamPage(group.team.customUrl)}
						className="stack horizontal items-center xs font-bold text-xs"
					>
						{group.team.avatarUrl ? (
							<Avatar url={group.team.avatarUrl} size="xxs" />
						) : null}
						{group.team.name}
					</Link>
				) : null}
			</div>
			<div className={styles.groupCard}>
				{group.users.map((user) => (
					<Link to={userPage(user)} key={user.id} className={styles.memberRow}>
						<Avatar user={user} size="xs" />
						{user.username}
					</Link>
				))}
			</div>
		</div>
	);
}

function InfoWithHeader({ header, value }: { header: string; value: string }) {
	return (
		<div>
			<div className={styles.infoHeader}>{header}</div>
			<div className={styles.infoValue}>{value}</div>
		</div>
	);
}

function ScreenBanIndicator() {
	const { t } = useTranslation(["weapons", "scrims"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div>
			<div className={styles.infoHeader}>{t("scrims:screenBan.header")}</div>
			<div
				className={clsx(styles.screenBanIndicator, {
					[styles.screenBanIndicatorWarning]: data.anyUserPrefersNoScreen,
				})}
			>
				<SendouPopover
					trigger={
						<SendouButton variant="minimal" size="miniscule">
							<div className={styles.screenBanImageWrapper}>
								<Image
									path={specialWeaponImageUrl(SPLATTERCOLOR_SCREEN_ID)}
									width={32}
									height={32}
									alt={t(`weapons:SPECIAL_${SPLATTERCOLOR_SCREEN_ID}`)}
								/>
								<div className={styles.screenBanIconOverlay}>
									{data.anyUserPrefersNoScreen ? (
										<AlertIcon />
									) : (
										<CheckmarkIcon />
									)}
								</div>
							</div>
						</SendouButton>
					}
				>
					<div className="text-xs">
						{data.anyUserPrefersNoScreen
							? t("scrims:screenBan.warning")
							: t("scrims:screenBan.allowed")}
					</div>
				</SendouPopover>
			</div>
		</div>
	);
}

function MapsLink({
	maps,
	tournamentMapPool,
}: Pick<ScrimPost, "maps"> &
	Pick<SerializeFrom<typeof loader>, "tournamentMapPool">) {
	const { t } = useTranslation(["scrims"]);

	const mapPool = () => {
		if (tournamentMapPool) return new MapPool(tournamentMapPool);

		if (maps === "SZ") return MapPool.SZ;
		if (maps === "RANKED") return MapPool.ANARCHY;
		if (maps === "ALL") return MapPool.ALL;

		logger.info(`Unknown scrim maps value: ${maps}`);
		return MapPool.ALL;
	};

	return (
		<div>
			<div className={styles.infoHeader}>{t("scrims:maps.header")}</div>
			<Link to={mapsPageWithMapPool(mapPool())}>
				<Image
					path={navIconUrl("maps")}
					width={32}
					height={32}
					alt="Generate maplist"
				/>
			</Link>
		</div>
	);
}

function ScrimChat() {
	const data = useLoaderData<typeof loader>();

	const chatCode = data.post.chatCode;
	const rooms = React.useMemo(
		() => (chatCode ? [{ label: "Scrim", code: chatCode }] : []),
		[chatCode],
	);

	if (!chatCode) {
		logger.warn("No chat code found");
		return null;
	}

	return (
		<div className={styles.chatContainer}>
			<ConnectedChat users={data.chatUsers} rooms={rooms} />
		</div>
	);
}
