import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { action as adminAction } from "~/features/tournament-admin/actions/to.$id.admin.registration.server";
import { ADMIN_REGISTRATION_MAX_MEMBERS } from "~/features/tournament-admin/tournament-admin-registration-schemas";
import { existingImage } from "~/form/image-field";
import { parseBody, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/zod";
import { wrapActionForApi } from "../api-action-wrapper.server";

const paramsSchema = z.object({
	id,
});

const bodySchema = z.object({
	tournamentTeamId: id.optional(),
	name: z.string().max(TOURNAMENT.TEAM_NAME_MAX_LENGTH).optional(),
	teamId: id.optional(),
	ownerUserId: id,
	members: z
		.array(
			z.object({
				userId: id,
				inGameName: z.string().optional(),
			}),
		)
		.min(1)
		.max(ADMIN_REGISTRATION_MAX_MEMBERS),
});

export const action = async (args: ActionFunctionArgs) => {
	const { id: tournamentId } = parseParams({
		params: args.params,
		schema: paramsSchema,
	});
	const body = await parseBody({
		request: args.request,
		schema: bodySchema,
	});

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
		}),
	});

	return wrapActionForApi(adminAction, {
		...args,
		params: { id: String(tournamentId) },
		request: internalRequest,
	});
};
