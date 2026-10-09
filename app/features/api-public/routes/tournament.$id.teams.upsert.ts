import * as v from "valibot";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { apiUpsertRegistrationAction } from "~/features/tournament-admin/actions/to.$id.admin.registration.server";
import { ADMIN_REGISTRATION_MAX_MEMBERS } from "~/features/tournament-admin/tournament-admin-registration-schemas";
import { defineAction } from "~/form/define-action.server";
import { existingImage } from "~/form/image-field";
import { RENDERS_FIELD_ERRORS_KEY } from "~/form/utils";
import { id, idObject } from "~/utils/schema";
import { wrapActionForApi } from "../api-action-wrapper.server";

const bodySchema = v.object({
	tournamentTeamId: v.optional(id),
	name: v.optional(
		v.pipe(v.string(), v.maxLength(TOURNAMENT.TEAM_NAME_MAX_LENGTH)),
	),
	teamId: v.optional(id),
	ownerUserId: id,
	members: v.pipe(
		v.array(
			v.object({
				userId: id,
				inGameName: v.optional(v.string()),
			}),
		),
		v.minLength(1),
		v.maxLength(ADMIN_REGISTRATION_MAX_MEMBERS),
	),
});

export const action = defineAction(
	{ params: idObject, body: bodySchema, onInvalidBody: "badRequest" },
	async ({ params: { id: tournamentId }, body, ...args }) => {
		const existingTeam =
			typeof body.tournamentTeamId === "number"
				? (
						await TournamentRepository.findTeamsFullByTournamentId(tournamentId)
					).find((team) => team.id === body.tournamentTeamId)
				: undefined;
		if (typeof body.tournamentTeamId === "number" && !existingTeam) {
			return Response.json(
				{ error: "Invalid tournament team id" },
				{
					status: 400,
				},
			);
		}

		const linkedTeam = typeof body.teamId === "number";
		// the API can't upload logos, so an existing pickup logo is carried over as is
		const logo =
			!linkedTeam && existingTeam
				? existingImage(existingTeam.avatarImgId, existingTeam.pickupAvatarUrl)
				: null;

		const internalRequest = new Request(args.request.url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				_action: "UPSERT_REGISTRATION",
				tournamentTeamId: body.tournamentTeamId,
				linkedTeam,
				pickUpName: body.name ?? null,
				logo,
				teamId: body.teamId ?? null,
				ownerId: String(body.ownerUserId),
				members: body.members.map((member) => ({
					userId: member.userId,
					inGameName: member.inGameName ?? null,
				})),
				// the API can't edit counterpick maps, so the team's existing pool is carried over as is
				mapPool: existingTeam?.mapPool ?? [],
				[RENDERS_FIELD_ERRORS_KEY]: true,
			}),
		});

		return wrapActionForApi(() =>
			apiUpsertRegistrationAction({
				...args,
				params: { id: String(tournamentId) },
				request: internalRequest,
			}),
		);
	},
);
