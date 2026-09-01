import type { ActionFunction } from "react-router";
import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { teamParamsSchema } from "~/features/team/team-schemas.server";
import { parseFormData } from "~/form/parse.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { errorToastIfFalsy, notFoundIfNullish } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { teamScheduleActionSchema } from "../availability-schemas";

export const action: ActionFunction = async ({ request, params }) => {
	const user = requireUser();
	const { customUrl } = v.parse(teamParamsSchema, params);

	const team = notFoundIfNullish(
		await TeamRepository.findByCustomUrl(customUrl),
	);

	requirePermission(team, "EDIT");

	const result = await parseFormData({
		request,
		schema: teamScheduleActionSchema,
	});

	if (!result.success) {
		return { fieldErrors: result.fieldErrors };
	}

	const data = result.data;

	switch (data._action) {
		case "ADD_EVENT": {
			const startsAt = dateToDatabaseTimestamp(data.startsAt);
			const participantUserIds = validatedParticipantUserIds(data, team);

			await AvailabilityRepository.insertTeamEvent({
				teamId: team.id,
				name: data.name,
				startsAt,
				endsAt: startsAt + Number(data.duration) * 60,
				participantUserIds,
			});

			await notify({
				userIds: team.members
					.filter(
						(member) =>
							member.id !== user.id &&
							member.role !== "CHEERLEADER" &&
							(!participantUserIds || participantUserIds.includes(member.id)),
					)
					.map((member) => member.id),
				notification: {
					type: "TEAM_EVENT_ADDED",
					meta: {
						eventName: data.name,
						teamName: team.name,
						teamCustomUrl: team.customUrl,
					},
					pictureUrl: team.avatarUrl ?? undefined,
				},
			});

			return null;
		}
		case "EDIT_EVENT": {
			const event = notFoundIfNullish(
				await AvailabilityRepository.findTeamEventById(data.eventId),
			);
			errorToastIfFalsy(
				event.teamId === team.id,
				"Event does not belong to the team",
			);

			const startsAt = dateToDatabaseTimestamp(data.startsAt);

			await AvailabilityRepository.updateTeamEvent({
				id: event.id,
				name: data.name,
				startsAt,
				endsAt: startsAt + Number(data.duration) * 60,
				participantUserIds: validatedParticipantUserIds(data, team),
			});

			return null;
		}
		case "DELETE_EVENT": {
			const event = notFoundIfNullish(
				await AvailabilityRepository.findTeamEventById(data.eventId),
			);
			errorToastIfFalsy(
				event.teamId === team.id,
				"Event does not belong to the team",
			);

			await AvailabilityRepository.deleteTeamEvent(event.id);

			return null;
		}
		default:
			assertUnreachable(data);
	}
};

function validatedParticipantUserIds(
	data: {
		participants: "ALL" | "SELECTED";
		participantUserIds: Array<string>;
	},
	team: NonNullable<Awaited<ReturnType<typeof TeamRepository.findByCustomUrl>>>,
) {
	if (data.participants !== "SELECTED") return undefined;

	const userIds = data.participantUserIds.map(Number);
	errorToastIfFalsy(
		userIds.every((userId) =>
			team.members.some(
				(member) => member.id === userId && member.role !== "CHEERLEADER",
			),
		),
		"Participants must be members of the team",
	);

	return userIds;
}
