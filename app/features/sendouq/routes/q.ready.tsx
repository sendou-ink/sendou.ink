import clsx from "clsx";
import { differenceInSeconds } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { Main } from "~/components/Main";
import { useUser } from "~/features/auth/core/user";
import { useWebsocketRevalidation } from "~/features/chat/chat-hooks";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { databaseTimestampToDate } from "~/utils/dates";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, SENDOUQ_READY_PAGE } from "~/utils/urls";
import { action } from "../actions/q.ready.server";
import { GroupCard, HiddenGroupCard } from "../components/GroupCard";
import { GroupLeaver } from "../components/GroupLeaver";
import { loader } from "../loaders/q.ready.server";
import { readySchema } from "../q-action-schemas";
import { sqGroupWebsocketRoom } from "../q-constants";

export { action, loader };

import styles from "./q.ready.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["q", "user"],
	breadcrumb: () => ({
		imgPath: navIconUrl("sendouq"),
		href: SENDOUQ_READY_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "SendouQ - Ready Check",
		location: args.location,
	});
};

export default function QReadyPage() {
	const { t } = useTranslation(["q"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();

	useWebsocketRevalidation(sqGroupWebsocketRoom(data.group.id));

	const ownIsReady = user ? data.readyUserIds.includes(user.id) : false;

	return (
		<Main className="stack lg items-center">
			<div className="stack sm items-center">
				<h2 className={styles.header}>{t("q:ready.header")}</h2>
				<Countdown expiresAt={data.expiresAt} />
				<div className="text-xs text-lighter text-center">
					{t("q:ready.explanation")}
				</div>
			</div>
			<div className="stack md items-center">
				{ownIsReady ? (
					<div className="text-sm" data-testid="ready-confirmed">
						{t("q:ready.waitingForOthers")}
					</div>
				) : (
					<ActionButton schema={readySchema} action="CONFIRM_READY" size="big">
						{t("q:ready.actions.ready")}
					</ActionButton>
				)}
				<GroupLeaver type="LEAVE_GROUP" />
			</div>
			<div className={styles.groupsContainer}>
				<GroupCard
					group={data.group}
					ownGroup={data.group}
					hideNote
					readyUserIds={data.readyUserIds}
				/>
				<HiddenGroupCard
					memberCount={data.theirGroup.memberCount}
					readyCount={data.theirGroup.readyCount}
				/>
			</div>
		</Main>
	);
}

function Countdown({ expiresAt }: { expiresAt: number }) {
	const now = useAutoRerender("second");
	const revalidator = useRevalidator();

	const secondsLeft = Math.max(
		0,
		differenceInSeconds(databaseTimestampToDate(expiresAt), now),
	);

	const isOver = secondsLeft === 0;
	React.useEffect(() => {
		// the ready check is resolved when someone asks for its state, so being
		// the one who ran out of time we ask
		if (isOver && revalidator.state === "idle") {
			revalidator.revalidate();
		}
	}, [isOver, revalidator]);

	return (
		<div
			className={clsx(styles.countdown, {
				[styles.countdownUrgent]: secondsLeft <= 60,
			})}
			data-testid="ready-check-countdown"
		>
			{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
		</div>
	);
}
