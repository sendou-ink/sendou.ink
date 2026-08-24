import { useTranslation } from "react-i18next";
import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { Main } from "~/components/Main";
import { useTopicRevalidation } from "~/features/chat/chat-hooks";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, SENDOUQ_PREPARING_PAGE } from "~/utils/urls";
import { action } from "../actions/q.preparing.server";
import { GroupCard } from "../components/GroupCard";
import { GroupLeaver } from "../components/GroupLeaver";
import { MemberAdder } from "../components/MemberAdder";
import { loader } from "../loaders/q.preparing.server";
import { preparingSchema } from "../q-action-schemas";
import { FULL_GROUP_SIZE, sqGroupChannel } from "../q-constants";

export { action, loader };

import styles from "./q.preparing.module.css";

export const handle: SendouRouteHandle = {
	i18n: ["q", "user"],
	breadcrumb: () => ({
		imgPath: navIconUrl("sendouq"),
		href: SENDOUQ_PREPARING_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "SendouQ - Preparing Group",
		image: ogPageImage("sendouq"),
		location: args.location,
	});
};

export default function QPreparingPage() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();

	useTopicRevalidation(sqGroupChannel(data.group.id));

	return (
		<Main className="stack lg items-center">
			<div className={styles.cardContainer}>
				<GroupCard group={data.group} hideNote ownGroup={data.group} />
			</div>
			{data.group.members.length < FULL_GROUP_SIZE ? (
				<MemberAdder
					inviteCode={data.group.inviteCode}
					groupMemberIds={data.group.members.map((m) => m.id)}
				/>
			) : null}
			<ActionButton schema={preparingSchema} action="JOIN_QUEUE" size="big">
				{t("q:preparing.joinQ")}
			</ActionButton>
			<GroupLeaver
				type={data.group.members.length === 1 ? "GO_BACK" : "LEAVE_GROUP"}
			/>
		</Main>
	);
}
