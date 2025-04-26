import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import { currentOrPreviousSeason } from "~/features/mmr/season";
import { userSkills } from "~/features/mmr/tiered.server";
import { cachedStreams } from "~/features/sendouq-streams/core/streams.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import invariant from "~/utils/invariant";
import { hasGroupManagerPerms } from "../core/groups";
import {
	addFutureMatchModes,
	addNoScreenIndicator,
	addReplayIndicator,
	addSkillRangeToGroups,
	addSkillsToGroups,
	censorGroups,
	censorGroupsIfOwnExpired,
	divideGroups,
	groupExpiryStatus,
	membersNeededForFull,
	sortGroupsBySkillAndSentiment,
} from "../core/groups.server";
import { FULL_GROUP_SIZE } from "../q-constants";
import { groupRedirectLocationByCurrentLocation } from "../q-utils";
import { findCurrentGroupByUserId } from "../queries/findCurrentGroupByUserId.server";
import { findLikes } from "../queries/findLikes";
import { findRecentMatchPlayersByUserId } from "../queries/findRecentMatchPlayersByUserId.server";
import { groupSize } from "../queries/groupSize.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUser(request);

	const isPreview = Boolean(
		new URL(request.url).searchParams.get("preview") === "true" &&
			user?.roles.includes("SUPPORTER"),
	);

	const currentGroup =
		user && !isPreview ? findCurrentGroupByUserId(user.id) : undefined;
	const redirectLocation = isPreview
		? undefined
		: groupRedirectLocationByCurrentLocation({
				group: currentGroup,
				currentLocation: "looking",
			});

	if (redirectLocation) {
		throw redirect(redirectLocation);
	}

	invariant(currentGroup || isPreview, "currentGroup is undefined");

	const currentGroupSize = currentGroup ? groupSize(currentGroup.id) : 1;
	const groupIsFull = currentGroupSize === FULL_GROUP_SIZE;

	const dividedGroups = divideGroups({
		groups: await QRepository.findLookingGroups({
			maxGroupSize:
				groupIsFull || isPreview
					? undefined
					: membersNeededForFull(currentGroupSize),
			minGroupSize: groupIsFull && !isPreview ? FULL_GROUP_SIZE : undefined,
			ownGroupId: currentGroup?.id,
			includeMapModePreferences: Boolean(groupIsFull || isPreview),
			loggedInUserId: user?.id,
		}),
		ownGroupId: currentGroup?.id,
		likes: currentGroup ? findLikes(currentGroup.id) : [],
	});

	const season = currentOrPreviousSeason(new Date());

	const {
		intervals,
		userSkills: calculatedUserSkills,
		isAccurateTiers,
	} = userSkills(season!.nth);
	const groupsWithSkills = addSkillsToGroups({
		groups: dividedGroups,
		intervals,
		userSkills: calculatedUserSkills,
	});

	const groupsWithFutureMatchModes = addFutureMatchModes(groupsWithSkills);

	const groupsWithNoScreenIndicator = addNoScreenIndicator(
		groupsWithFutureMatchModes,
	);

	const groupsWithReplayIndicator = groupIsFull
		? addReplayIndicator({
				groups: groupsWithNoScreenIndicator,
				recentMatchPlayers: findRecentMatchPlayersByUserId(user!.id),
				userId: user!.id,
			})
		: groupsWithNoScreenIndicator;

	const censoredGroups = censorGroups({
		groups: groupsWithReplayIndicator,
		showInviteCode: currentGroup
			? hasGroupManagerPerms(currentGroup.role) && !groupIsFull
			: false,
	});

	const rangedGroups = addSkillRangeToGroups({
		groups: censoredGroups,
		hasLeviathan: isAccurateTiers,
		isPreview,
	});

	const sortedGroups = sortGroupsBySkillAndSentiment({
		groups: rangedGroups,
		intervals,
		userSkills: calculatedUserSkills,
		userId: user?.id,
	});

	const expiryStatus = groupExpiryStatus(currentGroup);

	return {
		groups: censorGroupsIfOwnExpired({
			groups: sortedGroups,
			ownGroupExpiryStatus: expiryStatus,
		}),
		role: currentGroup ? currentGroup.role : ("PREVIEWER" as const),
		chatCode: currentGroup?.chatCode,
		lastUpdated: new Date().getTime(),
		streamsCount: (await cachedStreams()).length,
		expiryStatus: groupExpiryStatus(currentGroup),
	};
};
