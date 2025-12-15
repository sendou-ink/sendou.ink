import type { MetaFunction } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { useAutoRefresh } from "~/hooks/useAutoRefresh";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { navIconUrl, SENDOUQ_PREPARING_PAGE } from "~/utils/urls";
import { action } from "../actions/q.preparing.server";
import { GroupCard } from "../components/GroupCard";
import { GroupLeaver } from "../components/GroupLeaver";
import { MemberAdder } from "../components/MemberAdder";
import { loader } from "../loaders/q.preparing.server";
import { FULL_GROUP_SIZE } from "../q-constants";
export { loader, action };

import "../q.css";

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
		location: args.location,
	});
};

export default function QPreparingPage() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const joinQFetcher = useFetcher();
	useAutoRefresh(data.lastUpdated);

	return (
		<Main className="stack lg items-center">
			<div className="q-preparing__card-container">
				<GroupCard group={data.group} hideNote ownGroup={data.group} />
			</div>
			{data.group.members.length < FULL_GROUP_SIZE &&
			(data.group.usersRole === "OWNER" ||
				data.group.usersRole === "MANAGER") ? (
				<MemberAdder
					inviteCode={data.group.inviteCode}
					groupMemberIds={data.group.members.map((m) => m.id)}
				/>
			) : null}
			<joinQFetcher.Form method="post">
				<SubmitButton
					size="big"
					state={joinQFetcher.state}
					_action="JOIN_QUEUE"
				>
					{t("q:preparing.joinQ")}
				</SubmitButton>
			</joinQFetcher.Form>
			<GroupLeaver
				type={data.group.members.length === 1 ? "GO_BACK" : "LEAVE_GROUP"}
			/>
		</Main>
	);
}
