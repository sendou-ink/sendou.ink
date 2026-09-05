import type { LoaderFunctionArgs } from "react-router";
import * as R from "remeda";
import * as AssociationsRepository from "~/features/associations/AssociationRepository.server";
import * as Association from "~/features/associations/core/Association";
import { getUser } from "~/features/auth/core/user.server";
import * as RosterSchedule from "~/features/availability/core/RosterSchedule.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
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

	const { weekdayTimes, weekendTimes, divs, useDefaults } =
		scrimsSearchParams.parse(request);
	const filtersFromSearchParams = { weekdayTimes, weekendTimes, divs };

	// when the user cleared or edited the filters the URL is the whole truth
	// even when it ends up holding no filters at all
	const filters =
		useDefaults && Scrim.filtersAreDefault(filtersFromSearchParams)
			? (user?.preferences?.defaultScrimsFilters ?? Scrim.defaultFilters())
			: filtersFromSearchParams;

	const posts = (await ScrimPostRepository.findAllRelevant())
		.filter(
			(post) =>
				(user && Scrim.isParticipating(post, user.id)) ||
				Association.isVisible({
					associations,
					visibility: post.visibility,
					contentOwnerUserId: post.users.find((u) => u.isOwner)?.id,
				}),
		)
		.map((post) => ({
			...post,
			visibility: null,
			isPrivate: !Association.isPublic({
				visibility: post.visibility,
			}),
		}));

	const cardUserIds = R.unique(
		posts.flatMap((post) => [
			...post.users.map((user) => user.id),
			...post.requests.flatMap((request) =>
				request.users.map((user) => user.id),
			),
		]),
	);

	const dividedPosts = dividePosts(posts, user?.id);
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
		}),
		filters,
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
}: {
	posts: Array<ScrimPost>;
	teams: Awaited<ReturnType<typeof TeamRepository.findAllByMemberUserId>>;
}) {
	const userIds = R.unique(
		teams.flatMap((team) =>
			Scrim.teamPlayers(team.members).map((member) => member.id),
		),
	);
	const now = dateToDatabaseTimestamp(new Date());

	return {
		/** Server clock, so that the shown fit does not change on hydration. */
		now,
		windows: await RosterSchedule.windowSchedules({
			windows: posts.map((post) => ({
				id: post.id,
				...postSpan({ post, now }),
			})),
			userIds,
		}),
	};
}
