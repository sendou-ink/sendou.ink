import { Link, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { z } from "zod/v4";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouForm } from "~/components/form/SendouForm";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import TimePopover from "~/components/TimePopover";
import { SCRIM } from "~/features/scrims/scrims-constants";
import { cancelScrimSchema } from "~/features/scrims/scrims-schemas";
import { resolveRoomPass } from "~/features/tournament-bracket/tournament-bracket-utils";
import { useHasPermission } from "~/modules/permissions/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { userSubmittedImage } from "~/utils/urls-img";
import { Avatar } from "../../../components/Avatar";
import { Main } from "../../../components/Main";
import { databaseTimestampToDate } from "../../../utils/dates";
import { logger } from "../../../utils/logger";
import {
	navIconUrl,
	scrimsPage,
	teamPage,
	userPage,
} from "../../../utils/urls";
import { ConnectedChat } from "../../chat/components/Chat";
import { action } from "../actions/scrims.$id.server";
import * as Scrim from "../core/Scrim";
import { loader } from "../loaders/scrims.$id.server";
import type { ScrimPost as ScrimPostType } from "../scrims-types";
export { loader, action };

import styles from "./scrims.$id.module.css";

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
			</div>
			<ScrimChat />
		</Main>
	);
}

type FormFields = z.infer<typeof cancelScrimSchema>;

function CancelScrimForm() {
	const { t } = useTranslation(["scrims"]);

	return (
		<SendouForm
			schema={cancelScrimSchema}
			defaultValues={{ reason: "" }}
			submitButtonTestId="cancel-scrim-submit"
		>
			<TextAreaFormField<FormFields>
				name="reason"
				label={t("cancelModal.scrim.reasonLabel")}
				maxLength={SCRIM.CANCEL_REASON_MAX_LENGTH}
				bottomText={t("scrims:cancelModal.scrim.reasonExplanation")}
			/>
		</SendouForm>
	);
}

function ScrimHeader() {
	const { t } = useTranslation(["scrims"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div className="line-height-tight" data-testid="match-header">
			<h2 className="text-lg">
				<TimePopover
					time={databaseTimestampToDate(data.post.at)}
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
							<Avatar
								url={userSubmittedImage(group.team.avatarUrl)}
								size="xxs"
							/>
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
