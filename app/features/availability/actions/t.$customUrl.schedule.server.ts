import { requireUser } from "~/features/auth/core/user.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { teamParamsSchema } from "~/features/team/team-schemas.server";
import { defineAction } from "~/form/define-action.server";
import { requirePermission } from "~/modules/permissions/guards.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { errorToastIfFalsy, notFoundIfNullish } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as AvailabilityRepository from "../AvailabilityRepository.server";
import { teamScheduleActionSchema } from "../availability-schemas";

export const action = defineAction(
	{ params: teamParamsSchema, body: teamScheduleActionSchema },
	async ({ params: { customUrl }, body }) => {
		const user = requireUser();

		const team = notFoundIfNullish(
			await TeamRepository.findByCustomUrl(customUrl),
		);

		requirePermission(team, "EDIT");

		switch (body._action) {
			case "ADD_EVENT": {
				const startsAt = dateToDatabaseTimestamp(body.startsAt);
				const participantUserIds = validatedParticipantUserIds(body, team);

				await AvailabilityRepository.insertTeamEvent({
					teamId: team.id,
					name: body.name,
					startsAt,
					endsAt: startsAt + Number(body.duration) * 60,
					participantUserIds,
				});

				await notify({
					userIds: team.members
						.filter(
							(member) =>
								member.id !== user.id &&
								(!participantUserIds || participantUserIds.includes(member.id)),
						)
						.map((member) => member.id),
					notification: {
						type: "TEAM_EVENT_ADDED",
						meta: {
							eventName: body.name,
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
					await AvailabilityRepository.findTeamEventById(body.eventId),
				);
				errorToastIfFalsy(
					event.teamId === team.id,
					"Event does not belong to the team",
				);

				const startsAt = dateToDatabaseTimestamp(body.startsAt);

				await AvailabilityRepository.updateTeamEvent({
					id: event.id,
					name: body.name,
					startsAt,
					endsAt: startsAt + Number(body.duration) * 60,
					participantUserIds: validatedParticipantUserIds(body, team),
				});

				return null;
			}
			case "DELETE_EVENT": {
				const event = notFoundIfNullish(
					await AvailabilityRepository.findTeamEventById(body.eventId),
				);
				errorToastIfFalsy(
					event.teamId === team.id,
					"Event does not belong to the team",
				);

				await AvailabilityRepository.deleteTeamEvent(event.id);

				return null;
			}
			default:
				assertUnreachable(body);
		}
	},
);

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
			team.members.some((member) => member.id === userId),
		),
		"Participants must be members of the team",
	);

	return userIds;
}
