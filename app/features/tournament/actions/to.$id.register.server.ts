import type { ActionFunction } from "@remix-run/node";
import { requireUser } from "~/features/auth/core/user.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { notify } from "~/features/notifications/core/notify.server";
import * as QRepository from "~/features/sendouq/QRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { logger } from "~/utils/logger";
import {
	errorToastIfFalsy,
	parseFormData,
	parseParams,
	uploadImageIfSubmitted,
} from "~/utils/remix.server";
import { booleanToInt } from "~/utils/sql";
import { assertUnreachable } from "~/utils/types";
import { idObject } from "~/utils/zod";
import { checkIn } from "../queries/checkIn.server";
import { deleteTeam } from "../queries/deleteTeam.server";
import deleteTeamMember from "../queries/deleteTeamMember.server";
import { findOwnTournamentTeam } from "../queries/findOwnTournamentTeam.server";
import { joinTeam } from "../queries/joinLeaveTeam.server";
import { upsertCounterpickMaps } from "../queries/upsertCounterpickMaps.server";
import { registerSchema } from "../tournament-schemas.server";
import {
	isOneModeTournamentOf,
	validateCounterPickMapPool,
} from "../tournament-utils";
import { inGameNameIfNeeded } from "../tournament-utils.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUser(request);
	const { avatarFileName, formData } = await uploadImageIfSubmitted({
		request,
		fileNamePrefix: "pickup-logo",
	});
	const data = await parseFormData({
		formData,
		schema: registerSchema,
	});

	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});
	const tournament = await tournamentFromDB({ tournamentId, user });

	errorToastIfFalsy(
		!tournament.hasStarted,
		"Tournament has started, cannot make edits to registration",
	);

	const ownTeam = tournament.ownedTeamByUser(user);
	const ownTeamCheckedIn = Boolean(ownTeam && ownTeam.checkIns.length > 0);

	switch (data._action) {
		case "UPSERT_TEAM": {
			errorToastIfFalsy(
				!data.teamId ||
					(await TeamRepository.findAllMemberOfByUserId(user.id)).some(
						(team) => team.id === data.teamId,
					),
				"Team id does not match any of the teams you are in",
			);

			if (ownTeam) {
				errorToastIfFalsy(
					tournament.registrationOpen || data.teamName === ownTeam.name,
					"Can't change team name after registration has closed",
				);
				errorToastIfFalsy(
					!tournament.ctx.teams.some(
						(team) => team.name === data.teamName && team.id !== ownTeam.id,
					),
					"Team name already taken for this tournament",
				);

				await TournamentTeamRepository.update({
					userId: user.id,
					avatarFileName,
					team: {
						id: ownTeam.id,
						name: data.teamName,
						prefersNotToHost: booleanToInt(data.prefersNotToHost),
						noScreen: booleanToInt(data.noScreen),
						teamId: data.teamId ?? null,
					},
				});
			} else {
				errorToastIfFalsy(!tournament.isInvitational, "Event is invite only");
				errorToastIfFalsy(
					(await UserRepository.findLeanById(user.id))?.friendCode,
					"No friend code",
				);
				errorToastIfFalsy(
					!tournament.teamMemberOfByUser(user),
					"You are already in a team that you aren't captain of",
				);
				errorToastIfFalsy(
					tournament.registrationOpen,
					"Registration is closed",
				);
				errorToastIfFalsy(
					!tournament.ctx.teams.some((team) => team.name === data.teamName),
					"Team name already taken for this tournament",
				);

				await TournamentTeamRepository.create({
					ownerInGameName: await inGameNameIfNeeded({
						tournament,
						userId: user.id,
					}),
					team: {
						name: data.teamName,
						noScreen: booleanToInt(data.noScreen),
						prefersNotToHost: booleanToInt(data.prefersNotToHost),
						teamId: data.teamId ?? null,
					},
					userId: user.id,
					tournamentId,
					avatarFileName,
				});

				ShowcaseTournaments.addToCached({
					tournamentId,
					type: "participant",
					userId: user.id,
					newTeamCount: tournament.ctx.teams.length + 1,
				});
			}
			break;
		}
		case "DELETE_TEAM_MEMBER": {
			errorToastIfFalsy(ownTeam, "You are not registered to this tournament");
			errorToastIfFalsy(
				ownTeam.members.some((member) => member.userId === data.userId),
				"User is not in your team",
			);
			errorToastIfFalsy(data.userId !== user.id, "Can't kick yourself");

			const detailedOwnTeam = findOwnTournamentTeam({
				tournamentId,
				userId: user.id,
			});
			// making sure they aren't unfilling one checking in condition i.e. having full roster
			// and then having members kicked without it affecting the checking in status
			errorToastIfFalsy(
				detailedOwnTeam &&
					(!detailedOwnTeam.checkedInAt ||
						ownTeam.members.length > tournament.minMembersPerTeam),
				"Can't kick a member after checking in",
			);

			deleteTeamMember({ tournamentTeamId: ownTeam.id, userId: data.userId });

			ShowcaseTournaments.removeFromCached({
				tournamentId,
				type: "participant",
				userId: data.userId,
			});
			break;
		}
		case "LEAVE_TEAM": {
			errorToastIfFalsy(!ownTeam, "Can't leave a team as the owner");

			const teamMemberOf = tournament.teamMemberOfByUser(user);
			errorToastIfFalsy(teamMemberOf, "You are not in a team");
			errorToastIfFalsy(
				teamMemberOf.checkIns.length === 0,
				"You cannot leave after checking in",
			);

			deleteTeamMember({
				tournamentTeamId: teamMemberOf.id,
				userId: user.id,
			});

			ShowcaseTournaments.removeFromCached({
				tournamentId,
				type: "participant",
				userId: user.id,
			});

			break;
		}
		case "UPDATE_MAP_POOL": {
			const mapPool = new MapPool(data.mapPool);
			errorToastIfFalsy(ownTeam, "You are not registered to this tournament");
			errorToastIfFalsy(
				validateCounterPickMapPool(
					mapPool,
					isOneModeTournamentOf(
						tournament.ctx.mapPickingStyle,
						tournament.ctx.toSetMapPool,
					),
					tournament.ctx.tieBreakerMapPool,
				) === "VALID",
				"Invalid map pool",
			);

			upsertCounterpickMaps({
				tournamentTeamId: ownTeam.id,
				mapPool: new MapPool(data.mapPool),
			});
			break;
		}
		case "CHECK_IN": {
			logger.info(
				`Checking in (try): owned tournament team id: ${ownTeam?.id} - user id: ${user.id} - tournament id: ${tournamentId}`,
			);

			const teamMemberOf = tournament.teamMemberOfByUser(user);
			errorToastIfFalsy(teamMemberOf, "You are not in a team");
			errorToastIfFalsy(
				teamMemberOf.checkIns.length === 0,
				"You have already checked in",
			);

			errorToastIfFalsy(
				tournament.regularCheckInIsOpen,
				"Check in is not open",
			);
			errorToastIfFalsy(
				tournament.checkInConditionsFulfilledByTeamId(teamMemberOf.id)
					.isFulfilled,
				`Can't check-in - ${tournament.checkInConditionsFulfilledByTeamId(teamMemberOf.id).reason}`,
			);

			checkIn(teamMemberOf.id);
			logger.info(
				`Checking in (success): tournament team id: ${teamMemberOf.id} - user id: ${user.id} - tournament id: ${tournamentId}`,
			);
			break;
		}
		case "ADD_PLAYER": {
			errorToastIfFalsy(
				tournament.ctx.teams.every((team) =>
					team.members.every((member) => member.userId !== data.userId),
				),
				"User is already in a team",
			);
			errorToastIfFalsy(ownTeam, "You are not registered to this tournament");
			errorToastIfFalsy(
				(await QRepository.usersThatTrusted(user.id)).trusters.some(
					(trusterPlayer) => trusterPlayer.id === data.userId,
				),
				"No trust given from this user",
			);
			errorToastIfFalsy(
				(await UserRepository.findLeanById(user.id))?.friendCode,
				"No friend code",
			);
			errorToastIfFalsy(tournament.registrationOpen, "Registration is closed");

			joinTeam({
				userId: data.userId,
				newTeamId: ownTeam.id,
				tournamentId,
				inGameName: await inGameNameIfNeeded({
					tournament,
					userId: data.userId,
				}),
			});
			await QRepository.refreshTrust({
				trustGiverUserId: data.userId,
				trustReceiverUserId: user.id,
			});

			ShowcaseTournaments.addToCached({
				tournamentId,
				type: "participant",
				userId: data.userId,
			});

			if (!tournament.isTest) {
				notify({
					userIds: [data.userId],
					notification: {
						type: "TO_ADDED_TO_TEAM",
						meta: {
							adderUsername: user.username,
							tournamentId,
							teamName: ownTeam.name,
							tournamentName: tournament.ctx.name,
							tournamentTeamId: ownTeam.id,
						},
						pictureUrl: tournament.logoSrc,
					},
				});
			}

			break;
		}
		case "UNREGISTER": {
			errorToastIfFalsy(ownTeam, "You are not registered to this tournament");
			errorToastIfFalsy(
				!ownTeamCheckedIn,
				"You cannot unregister after checking in",
			);
			errorToastIfFalsy(
				!tournament.isLeagueSignup || tournament.registrationOpen,
				"Unregistering from leagues is not possible after registration has closed",
			);

			deleteTeam(ownTeam.id);

			for (const member of ownTeam.members) {
				ShowcaseTournaments.removeFromCached({
					tournamentId,
					type: "participant",
					userId: member.userId,
				});

				ShowcaseTournaments.updateCachedTournamentTeamCount({
					tournamentId,
					newTeamCount: tournament.ctx.teams.length - 1,
				});
			}

			break;
		}
		case "DELETE_LOGO": {
			errorToastIfFalsy(ownTeam, "You are not registered to this tournament");

			await TournamentTeamRepository.deleteLogo(ownTeam.id);

			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	return null;
};
