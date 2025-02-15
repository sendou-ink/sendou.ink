import type {
	ActionFunctionArgs,
	LoaderFunctionArgs,
	MetaFunction,
} from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { getUser, requireUser } from "~/features/auth/core/user.server";
import { currentSeason } from "~/features/mmr/season";
import * as QMatchRepository from "~/features/sendouq-match/QMatchRepository.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import { useAutoRefresh } from "~/hooks/useAutoRefresh";
import invariant from "~/utils/invariant";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { parseRequestPayload, validate } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PREPARING_PAGE,
	navIconUrl,
} from "~/utils/urls";
import { GroupCard } from "../components/GroupCard";
import { GroupLeaver } from "../components/GroupLeaver";
import { MemberAdder } from "../components/MemberAdder";
import { hasGroupManagerPerms } from "../core/groups";
import { FULL_GROUP_SIZE } from "../q-constants";
import { preparingSchema } from "../q-schemas.server";
import { groupRedirectLocationByCurrentLocation } from "../q-utils";
import { addMember } from "../queries/addMember.server";
import { findCurrentGroupByUserId } from "../queries/findCurrentGroupByUserId.server";
import { findPreparingGroup } from "../queries/findPreparingGroup.server";
import { refreshGroup } from "../queries/refreshGroup.server";
import { setGroupAsActive } from "../queries/setGroupAsActive.server";

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

export type SendouQPreparingAction = typeof action;

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: preparingSchema,
	});

	const currentGroup = findCurrentGroupByUserId(user.id);
	validate(currentGroup, "No group found");

	if (!hasGroupManagerPerms(currentGroup.role)) {
		return null;
	}

	const season = currentSeason(new Date());
	validate(season, "Season is not active");

	switch (data._action) {
		case "JOIN_QUEUE": {
			if (currentGroup.status !== "PREPARING") {
				return null;
			}

			setGroupAsActive(currentGroup.id);
			refreshGroup(currentGroup.id);

			return redirect(SENDOUQ_LOOKING_PAGE);
		}
		case "ADD_TRUSTED": {
			const available = await QRepository.findActiveGroupMembers();
			if (available.some(({ userId }) => userId === data.id)) {
				return { error: "taken" } as const;
			}

			validate(
				(await QRepository.usersThatTrusted(user.id)).trusters.some(
					(trusterUser) => trusterUser.id === data.id,
				),
				"Not trusted",
			);

			const ownGroupWithMembers = await QMatchRepository.findGroupById({
				groupId: currentGroup.id,
			});
			invariant(ownGroupWithMembers, "No own group found");
			validate(
				ownGroupWithMembers.members.length < FULL_GROUP_SIZE,
				"Group is full",
			);

			addMember({
				groupId: currentGroup.id,
				userId: data.id,
				role: "MANAGER",
			});
			await QRepository.refreshTrust({
				trustGiverUserId: data.id,
				trustReceiverUserId: user.id,
			});

			return null;
		}
		default: {
			assertUnreachable(data);
		}
	}
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUser(request);

	const currentGroup = user ? findCurrentGroupByUserId(user.id) : undefined;
	const redirectLocation = groupRedirectLocationByCurrentLocation({
		group: currentGroup,
		currentLocation: "preparing",
	});

	if (redirectLocation) {
		throw redirect(redirectLocation);
	}

	const ownGroup = findPreparingGroup(currentGroup!.id);
	invariant(ownGroup, "No own group found");

	return {
		lastUpdated: new Date().getTime(),
		group: ownGroup,
		role: currentGroup!.role,
	};
};

export default function QPreparingPage() {
	const { t } = useTranslation(["q"]);
	const data = useLoaderData<typeof loader>();
	const joinQFetcher = useFetcher();
	useAutoRefresh(data.lastUpdated);

	return (
		<Main className="stack lg items-center">
			<div className="q-preparing__card-container">
				<GroupCard
					group={data.group}
					ownRole={data.role}
					ownGroup
					hideNote
					enableKicking={data.role === "OWNER"}
				/>
			</div>
			{data.group.members.length < FULL_GROUP_SIZE &&
			hasGroupManagerPerms(data.role) ? (
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
