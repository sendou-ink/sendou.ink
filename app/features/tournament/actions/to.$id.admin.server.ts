import type { ActionFunction } from "@remix-run/node";
import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import { userIsBanned } from "~/features/ban/core/banned.server";
import * as ShowcaseTournaments from "~/features/front-page/core/ShowcaseTournaments.server";
import { notify } from "~/features/notifications/core/notify.server";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentTeamRepository from "~/features/tournament/TournamentTeamRepository.server";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	badRequestIfFalsy,
	errorToastIfFalsy,
	parseRequestPayload,
	successToast,
} from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { USER } from "../../../constants";
import { _action, id } from "../../../utils/zod";
import { bracketProgressionSchema } from "../../calendar/actions/calendar.new.server";
import { bracketIdx } from "../../tournament-bracket/tournament-bracket-schemas.server";
import * as TournamentRepository from "../TournamentRepository.server";
import { changeTeamOwner } from "../queries/changeTeamOwner.server";
import { deleteTeam } from "../queries/deleteTeam.server";
import { joinTeam, leaveTeam } from "../queries/joinLeaveTeam.server";
import { teamName } from "../tournament-schemas.server";
import { tournamentIdFromParams } from "../tournament-utils";
import { inGameNameIfNeeded } from "../tournament-utils.server";

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUser(request);
	const data = await parseRequestPayload({
		request,
		schema: adminActionSchema,
	});

	const tournamentId = tournamentIdFromParams(params);
	const tournament = await tournamentFromDB({ tournamentId, user });

	const validateIsTournamentAdmin = () =>
		errorToastIfFalsy(tournament.isAdmin(user), "Unauthorized");
	const validateIsTournamentOrganizer = () =>
		errorToastIfFalsy(tournament.isOrganizer(user), "Unauthorized");

	let message: string;
	switch (data._action) {
		case "ADD_TEAM": {
			validateIsTournamentOrganizer();
			errorToastIfFalsy(
				tournament.ctx.teams.every((t) => t.name !== data.teamName),
				"Team name taken",
			);
			errorToastIfFalsy(
				!tournament.teamMemberOfByUser({ id: data.userId }),
				"User already on a team",
			);

			await TournamentTeamRepository.create({
				ownerInGameName: await inGameNameIfNeeded({
					tournament,
					userId: data.userId,
				}),
				team: {
					name: data.teamName,
					noScreen: 0,
					prefersNotToHost: 0,
					teamId: null,
				},
				userId: data.userId,
				tournamentId,
			});

			ShowcaseTournaments.addToParticipationInfoMap({
				tournamentId,
				type: "participant",
				userId: data.userId,
			});

			message = "Team added";
			break;
		}
		case "CHANGE_TEAM_OWNER": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			const oldCaptain = team.members.find((m) => m.isOwner);
			invariant(oldCaptain, "Team has no captain");
			const newCaptain = team.members.find((m) => m.userId === data.memberId);
			errorToastIfFalsy(newCaptain, "Invalid member id");

			changeTeamOwner({
				newCaptainId: data.memberId,
				oldCaptainId: oldCaptain.userId,
				tournamentTeamId: data.teamId,
			});

			message = "Team owner changed";
			break;
		}
		case "CHANGE_TEAM_NAME": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");

			await TournamentRepository.updateTeamName({
				tournamentTeamId: data.teamId,
				name: data.teamName,
			});

			message = "Team name changed";
			break;
		}
		case "CHECK_IN": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(
				data.bracketIdx !== 0 ||
					tournament.checkInConditionsFulfilledByTeamId(team.id).isFulfilled,
				`Can't check-in - ${tournament.checkInConditionsFulfilledByTeamId(team.id).reason}`,
			);
			errorToastIfFalsy(
				team.checkIns.length > 0 || data.bracketIdx === 0,
				"Can't check-in to follow up bracket if not checked in for the event itself",
			);

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Invalid bracket idx");
			errorToastIfFalsy(bracket.preview, "Bracket has been started");

			await TournamentRepository.checkIn({
				tournamentTeamId: data.teamId,
				// no sources = regular check in
				bracketIdx: !bracket.sources ? null : data.bracketIdx,
			});

			message = "Checked team in";
			break;
		}
		case "CHECK_OUT": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(
				data.bracketIdx !== 0 || !tournament.hasStarted,
				"Tournament has started",
			);

			const bracket = tournament.bracketByIdx(data.bracketIdx);
			invariant(bracket, "Invalid bracket idx");
			errorToastIfFalsy(bracket.preview, "Bracket has been started");

			await TournamentRepository.checkOut({
				tournamentTeamId: data.teamId,
				// no sources = regular check in
				bracketIdx: !bracket.sources ? null : data.bracketIdx,
			});
			logger.info(
				`Checked out: tournament team id: ${data.teamId} - user id: ${user.id} - tournament id: ${tournamentId} - bracket idx: ${data.bracketIdx}`,
			);

			message = "Checked team out";
			break;
		}
		case "REMOVE_MEMBER": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(
				team.checkIns.length === 0 ||
					team.members.length > tournament.minMembersPerTeam,
				"Can't remove last member from checked in team",
			);
			errorToastIfFalsy(
				!team.members.find((m) => m.userId === data.memberId)?.isOwner,
				"Cannot remove team owner",
			);
			errorToastIfFalsy(
				!tournament.hasStarted ||
					!tournament
						.participatedPlayersByTeamId(data.teamId)
						.some((p) => p.userId === data.memberId),
				"Cannot remove player that has participated in the tournament",
			);

			leaveTeam({
				userId: data.memberId,
				teamId: team.id,
			});

			ShowcaseTournaments.removeFromParticipationInfoMap({
				tournamentId,
				type: "participant",
				userId: data.memberId,
			});

			message = "Member removed";
			break;
		}
		case "ADD_MEMBER": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");

			const previousTeam = tournament.teamMemberOfByUser({ id: data.userId });

			errorToastIfFalsy(
				!previousTeam?.id || previousTeam.id !== team.id,
				"User is already in this team",
			);

			errorToastIfFalsy(
				tournament.hasStarted || !previousTeam,
				"User is already in a team",
			);

			errorToastIfFalsy(
				!userIsBanned(data.userId),
				"User trying to be added currently has an active ban from sendou.ink",
			);

			joinTeam({
				userId: data.userId,
				newTeamId: team.id,
				previousTeamId: previousTeam?.id,
				// this team is not checked in & tournament started, so we can simply delete it
				whatToDoWithPreviousTeam:
					previousTeam &&
					previousTeam.checkIns.length === 0 &&
					tournament.hasStarted
						? "DELETE"
						: undefined,
				tournamentId,
				inGameName: await inGameNameIfNeeded({
					tournament,
					userId: data.userId,
				}),
			});

			ShowcaseTournaments.addToParticipationInfoMap({
				tournamentId,
				type: "participant",
				userId: data.userId,
			});

			notify({
				userIds: [data.userId],
				notification: {
					type: "TO_ADDED_TO_TEAM",
					pictureUrl:
						tournament.tournamentTeamLogoSrc(team) ?? tournament.ctx.logoSrc,
					meta: {
						adderUsername: user.username,
						teamName: team.name,
						tournamentId,
						tournamentName: tournament.ctx.name,
						tournamentTeamId: team.id,
					},
				},
			});

			message = "Member added";
			break;
		}
		case "DELETE_TEAM": {
			validateIsTournamentOrganizer();
			const team = tournament.teamById(data.teamId);
			errorToastIfFalsy(team, "Invalid team id");
			errorToastIfFalsy(!tournament.hasStarted, "Tournament has started");

			deleteTeam(team.id);

			ShowcaseTournaments.clearParticipationInfoMap();

			message = "Team deleted from tournament";
			break;
		}
		case "ADD_STAFF": {
			validateIsTournamentAdmin();

			await TournamentRepository.addStaff({
				role: data.role,
				tournamentId: tournament.ctx.id,
				userId: data.userId,
			});

			if (data.role === "ORGANIZER") {
				ShowcaseTournaments.addToParticipationInfoMap({
					tournamentId,
					type: "organizer",
					userId: data.userId,
				});
			}

			message = "Staff member added";
			break;
		}
		case "REMOVE_STAFF": {
			validateIsTournamentAdmin();

			await TournamentRepository.removeStaff({
				tournamentId: tournament.ctx.id,
				userId: data.userId,
			});

			ShowcaseTournaments.removeFromParticipationInfoMap({
				tournamentId,
				type: "organizer",
				userId: data.userId,
			});

			message = "Staff member removed";
			break;
		}
		case "UPDATE_CAST_TWITCH_ACCOUNTS": {
			validateIsTournamentOrganizer();
			await TournamentRepository.updateCastTwitchAccounts({
				tournamentId: tournament.ctx.id,
				castTwitchAccounts: data.castTwitchAccounts,
			});

			message = "Cast account updated";
			break;
		}
		case "DROP_TEAM_OUT": {
			validateIsTournamentOrganizer();
			await TournamentRepository.dropTeamOut({
				tournamentTeamId: data.teamId,
				previewBracketIdxs: tournament.brackets.flatMap((b, idx) =>
					b.preview ? idx : [],
				),
			});

			message = "Team dropped out";
			break;
		}
		case "UNDO_DROP_TEAM_OUT": {
			validateIsTournamentOrganizer();

			await TournamentRepository.undoDropTeamOut(data.teamId);

			message = "Team drop out undone";
			break;
		}
		case "RESET_BRACKET": {
			validateIsTournamentOrganizer();
			errorToastIfFalsy(!tournament.ctx.isFinalized, "Tournament is finalized");

			const bracketToResetIdx = tournament.brackets.findIndex(
				(b) => b.id === data.stageId,
			);
			const bracketToReset = tournament.brackets[bracketToResetIdx];
			errorToastIfFalsy(bracketToReset, "Invalid bracket id");
			errorToastIfFalsy(!bracketToReset.preview, "Bracket has not started");

			const inProgressBrackets = tournament.brackets.filter((b) => !b.preview);
			errorToastIfFalsy(
				inProgressBrackets.every(
					(b) =>
						!b.sources ||
						b.sources.every((s) => s.bracketIdx !== bracketToResetIdx),
				),
				"Some bracket that sources teams from this bracket has started",
			);

			await TournamentRepository.resetBracket(data.stageId);

			message = "Bracket reset";
			break;
		}
		case "UPDATE_IN_GAME_NAME": {
			validateIsTournamentOrganizer();

			const teamMemberOf = badRequestIfFalsy(
				tournament.teamMemberOfByUser({ id: data.memberId }),
			);

			await TournamentTeamRepository.updateMemberInGameName({
				userId: data.memberId,
				inGameName: `${data.inGameNameText}#${data.inGameNameDiscriminator}`,
				tournamentTeamId: teamMemberOf.id,
			});

			message = "Player in-game name updated";
			break;
		}
		case "DELETE_LOGO": {
			validateIsTournamentOrganizer();

			await TournamentTeamRepository.deleteLogo(data.teamId);

			message = "Logo deleted";
			break;
		}
		case "UPDATE_TOURNAMENT_PROGRESSION": {
			validateIsTournamentOrganizer();
			errorToastIfFalsy(!tournament.ctx.isFinalized, "Tournament is finalized");

			errorToastIfFalsy(
				Progression.changedBracketProgression(
					tournament.ctx.settings.bracketProgression,
					data.bracketProgression,
				).every(
					(changedBracketIdx) =>
						tournament.bracketByIdx(changedBracketIdx)?.preview,
				),
				"Can't change started brackets",
			);

			await TournamentRepository.updateProgression({
				tournamentId: tournament.ctx.id,
				bracketProgression: data.bracketProgression,
			});

			message = "Tournament progression updated";
			break;
		}
		default: {
			assertUnreachable(data);
		}
	}

	clearTournamentDataCache(tournamentId);

	return successToast(message);
};

export const adminActionSchema = z.union([
	z.object({
		_action: _action("CHANGE_TEAM_OWNER"),
		teamId: id,
		memberId: id,
	}),
	z.object({
		_action: _action("CHANGE_TEAM_NAME"),
		teamId: id,
		teamName,
	}),
	z.object({
		_action: _action("CHECK_IN"),
		teamId: id,
		bracketIdx,
	}),
	z.object({
		_action: _action("CHECK_OUT"),
		teamId: id,
		bracketIdx,
	}),
	z.object({
		_action: _action("ADD_MEMBER"),
		teamId: id,
		userId: id,
	}),
	z.object({
		_action: _action("REMOVE_MEMBER"),
		teamId: id,
		memberId: id,
	}),
	z.object({
		_action: _action("DELETE_TEAM"),
		teamId: id,
	}),
	z.object({
		_action: _action("ADD_TEAM"),
		userId: id,
		teamName,
	}),
	z.object({
		_action: _action("ADD_STAFF"),
		userId: id,
		role: z.enum(["ORGANIZER", "STREAMER"]),
	}),
	z.object({
		_action: _action("REMOVE_STAFF"),
		userId: id,
	}),
	z.object({
		_action: _action("DROP_TEAM_OUT"),
		teamId: id,
	}),
	z.object({
		_action: _action("UNDO_DROP_TEAM_OUT"),
		teamId: id,
	}),
	z.object({
		_action: _action("DELETE_LOGO"),
		teamId: id,
	}),
	z.object({
		_action: _action("UPDATE_CAST_TWITCH_ACCOUNTS"),
		castTwitchAccounts: z.preprocess(
			(val) =>
				typeof val === "string"
					? val
							.split(",")
							.map((account) => account.trim())
							.map((account) => account.toLowerCase())
					: val,
			z.array(z.string()),
		),
	}),
	z.object({
		_action: _action("RESET_BRACKET"),
		stageId: id,
	}),
	z.object({
		_action: _action("UPDATE_IN_GAME_NAME"),
		inGameNameText: z.string().max(USER.IN_GAME_NAME_TEXT_MAX_LENGTH),
		inGameNameDiscriminator: z
			.string()
			.refine((val) => /^[0-9a-z]{4,5}$/.test(val)),
		memberId: id,
	}),
	z.object({
		_action: _action("UPDATE_TOURNAMENT_PROGRESSION"),
		bracketProgression: bracketProgressionSchema,
	}),
]);
