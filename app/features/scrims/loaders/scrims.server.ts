import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import * as AssociationsRepository from "~/features/associations/AssociationRepository.server";
import { getUser } from "~/features/auth/core/user.server";
import * as RosterSchedule from "~/features/availability/core/RosterSchedule.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { databaseTimestampNow } from "~/utils/dates";
import * as TeamRepository from "../../team/TeamRepository.server";
import * as Scrim from "../core/Scrim";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { scrimsSearchParams } from "../scrims-search-params";
import type { ScrimPost } from "../scrims-types";
import { dividePosts, postSpan } from "../scrims-utils";

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = getUser();

	const associations = user
		? await AssociationsRepository.findByMemberUserId(user?.id)
		: null;

	const { weekdayTimes, weekendTimes, divs, useDefaults, associationId } =
		scrimsSearchParams.parse(request);
	const filtersFromSearchParams = { weekdayTimes, weekendTimes, divs };

	// when the user cleared or edited the filters the URL is the whole truth
	// even when it ends up holding no filters at all
	const filters =
		useDefaults && Scrim.filtersAreDefault(filtersFromSearchParams)
			? (user?.preferences?.defaultScrimsFilters ?? Scrim.defaultFilters())
			: filtersFromSearchParams;

	// a filter for an association the viewer is not in is ignored rather than showing an empty page
	const associationFilter =
		associations?.actual.find(
			(association) => association.id === associationId,
		) ?? null;

	// the association filter narrows browsing only, the viewer's own and booked posts stay listed
	const dividedPosts = dividePosts(
		await ScrimPostRepository.findAllRelevant(associationFilter?.id ?? null),
		user?.id,
	);

	const cardUserIds = R.unique(
		[
			...dividedPosts.neutral,
			...dividedPosts.owned,
			...dividedPosts.booked,
		].flatMap((post) => [
			...post.users.map((postUser) => postUser.id),
			...post.requests.flatMap((postRequest) =>
				postRequest.users.map((requestUser) => requestUser.id),
			),
		]),
	);

	const teams = user ? await TeamRepository.findAllByMemberUserId(user.id) : [];

	return {
		...(await UserCardRepository.findAllByUserIds({
			userIds: cardUserIds,
		})),
		posts: dividedPosts,
		teams,
		availability: await rosterAvailability({
			posts: dividedPosts.neutral,
			teams,
			viewerId: user?.id ?? null,
		}),
		filters,
		associationFilter: associationFilter
			? { id: associationFilter.id, name: associationFilter.name }
			: null,
		associationOptions:
			associations?.actual.map((association) => ({
				id: association.id,
				name: association.name,
			})) ?? [],
		canSaveAsDefault:
			user != null &&
			!R.isDeepEqual(
				filters,
				user.preferences?.defaultScrimsFilters ?? Scrim.defaultFilters(),
			),
	};
};

/** How the viewer's teams relate to the requestable posts, one entry per post: what the fit indicators on cards and in the request dialog resolve from. */
async function rosterAvailability({
	posts,
	teams,
	viewerId,
}: {
	posts: Array<ScrimPost>;
	teams: Awaited<ReturnType<typeof TeamRepository.findAllByMemberUserId>>;
	viewerId: number | null;
}) {
	const userIds = R.unique(
		teams.flatMap((team) =>
			Scrim.teamPlayers(team.members).map((member) => member.id),
		),
	);
	const now = databaseTimestampNow();

	return {
		/** Server clock, so that the shown fit does not change on hydration. */
		now,
		windows: await RosterSchedule.windowSchedules({
			windows: posts.map((post) => ({
				id: post.id,
				...postSpan({ post, now }),
			})),
			userIds,
			viewerId,
		}),
	};
}
