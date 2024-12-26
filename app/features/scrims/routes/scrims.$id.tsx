import { Link, useLoaderData } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { resolveRoomPass } from "~/features/tournament-bracket/tournament-bracket-utils";
import { Avatar } from "../../../components/Avatar";
import { Main } from "../../../components/Main";
import { databaseTimestampToDate } from "../../../utils/dates";
import { logger } from "../../../utils/logger";
import { teamPage, userSubmittedImage } from "../../../utils/urls";
import { ConnectedChat } from "../../chat/components/Chat";
import * as ScrimPost from "../core/ScrimPost";
import type { ScrimPost as ScrimPostType } from "../scrims-types";

import { loader } from "../loaders/scrims.$id.server";
export { loader };

import "../scrims.css";

export default function ScrimPage() {
	const data = useLoaderData<typeof loader>();

	return (
		<Main className="stack lg">
			<ScrimHeader />
			<div className="scrims__groups-container">
				<GroupCard group={data.post} side="ALPHA" />
				<GroupCard group={data.post.requests[0]} side="BRAVO" />
			</div>
			<div className="stack horizontal lg justify-center">
				<InfoWithHeader header="Pass" value={resolveRoomPass(data.post.id)} />
				<InfoWithHeader
					header="Pool"
					value={ScrimPost.resolvePoolCode(data.post.id)}
				/>
			</div>
			<ScrimChat />
		</Main>
	);
}

// xxx: hydration
function ScrimHeader() {
	const data = useLoaderData<typeof loader>();
	const { i18n } = useTranslation();

	return (
		<div className="line-height-tight" data-testid="match-header">
			<h2 className="text-lg">
				{databaseTimestampToDate(data.post.at).toLocaleString(i18n.language, {
					weekday: "long",
					year: "numeric",
					month: "long",
					day: "numeric",
					hour: "numeric",
					minute: "numeric",
				})}
			</h2>
			<div className="text-lighter text-xs font-bold">Scheduled scrim</div>
		</div>
	);
}

// xxx: validate team can show up
function GroupCard({
	group,
	side,
}: {
	group: { users: ScrimPostType["users"]; team: ScrimPostType["team"] };
	side: "ALPHA" | "BRAVO";
}) {
	return (
		<div className="stack sm">
			<div className="stack horizontal justify-between">
				<div className="text-lighter text-xs">
					{side === "ALPHA" ? "Alpha" : "Bravo"}
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
			<div className="scrims__group-card">
				{group.users.map((user) => (
					<div key={user.id} className="scrims__group-card__member-row">
						<Avatar user={user} size="xs" />
						{user.username}
					</div>
				))}
			</div>
		</div>
	);
}

function InfoWithHeader({ header, value }: { header: string; value: string }) {
	return (
		<div>
			<div className="scrims__info__header">{header}</div>
			<div className="scrims__info__value">{value}</div>
		</div>
	);
}

// xxx: users from loader
const users = {};
function ScrimChat() {
	const data = useLoaderData<typeof loader>();

	const chatCode = data.post.chatCode;
	if (!chatCode) {
		logger.warn("No chat code found");
		return null;
	}

	const rooms = React.useMemo(
		() => [{ label: "Scrim", code: chatCode }],
		[chatCode],
	);

	return (
		<div className="scrims__chat-container">
			<ConnectedChat users={users} rooms={rooms} />
		</div>
	);
}
