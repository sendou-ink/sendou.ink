import { type ActionFunctionArgs, redirect } from "@remix-run/node";
import type { z } from "zod";
import type { Tables } from "~/db/tables";
import { requireUser } from "~/features/auth/core/user.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { errorToastIfFalsy, parseRequestPayload } from "~/utils/remix.server";
import { scrimsPage } from "~/utils/urls";
import * as TeamRepository from "../../team/TeamRepository.server";
import * as ScrimPostRepository from "../ScrimPostRepository.server";
import { type fromSchema, scrimsNewActionSchema } from "../scrims-schemas";
import { serializeLutiDiv } from "../scrims-utils";

export const action = async ({ request }: ActionFunctionArgs) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: scrimsNewActionSchema,
	});

	// xxx: some checks? like do they have a post with same at

	await ScrimPostRepository.insert({
		at: dateToDatabaseTimestamp(data.at),
		maxDiv: data.divs ? serializeLutiDiv(data.divs.max!) : null,
		minDiv: data.divs ? serializeLutiDiv(data.divs.min!) : null,
		text: data.postText,
		teamId: data.from.mode === "TEAM" ? data.from.teamId : null,
		users: (await usersListForPost({ authorId: user.id, from: data.from })).map(
			(userId) => ({
				userId,
				isOwner: Number(user.id === userId),
			}),
		),
	});

	return redirect(scrimsPage());
};

const ROLES_TO_EXCLUDE: Tables["TeamMember"]["role"][] = [
	"CHEERLEADER",
	"COACH",
	"SUB",
];

export const usersListForPost = async ({
	from,
	authorId,
}: { from: z.infer<typeof fromSchema>; authorId: number }) => {
	if (from.mode === "PICKUP") {
		return [authorId, ...from.users];
	}

	const teamId = from.teamId;
	const team = (await TeamRepository.teamsByMemberUserId(authorId)).find(
		(team) => team.id === teamId,
	);
	errorToastIfFalsy(team, "User is not a member of this team");

	return team.members
		.filter((member) => !ROLES_TO_EXCLUDE.includes(member.role))
		.map((member) => member.id);
};
