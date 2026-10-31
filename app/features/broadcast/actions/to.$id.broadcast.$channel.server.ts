import { requireUser } from "~/features/auth/core/user.server";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy, notFoundIfNullish } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import * as BroadcastRepository from "../BroadcastRepository.server";
import {
	broadcastActionSchema,
	broadcastParamsSchema,
} from "../broadcast-schemas";
import { requireBroadcastProducer } from "../broadcast-utils.server";
import * as BroadcastHub from "../core/BroadcastHub.server";
import * as BroadcastSnapshot from "../core/BroadcastSnapshot.server";
import * as CastChannel from "../core/CastChannel";
import * as Producer from "../core/Producer";
import * as TeamOverrides from "../core/TeamOverrides";

const STALE_TAKE_MESSAGE =
	"Someone else took in the meantime, check what is live now";

export const action = defineAction(
	{ params: broadcastParamsSchema, body: broadcastActionSchema },
	async ({ params, body }) => {
		const user = requireUser();
		const tournament = await tournamentFromDB(params.id);
		requireBroadcastProducer(tournament, user);

		const channel = notFoundIfNullish(
			CastChannel.findBySlug(tournament.ctx.castAccounts, params.channel),
		);
		const key = { tournamentId: tournament.ctx.id, channel };

		switch (body._action) {
			case "SET_NEXT_SCENE": {
				await BroadcastRepository.updateNext({
					...key,
					patch: { scene: body.scene },
				});
				break;
			}
			case "SET_NEXT_SWAP_SIDES": {
				await BroadcastRepository.updateNext({
					...key,
					patch: { swapSides: body.swapSides },
				});
				break;
			}
			case "TAKE": {
				const state =
					(await BroadcastRepository.findByChannel(key))?.state ??
					Producer.initialState();
				errorToastIfFalsy(state.takeId === body.takeId, STALE_TAKE_MESSAGE);

				const replaced = await BroadcastRepository.replaceState({
					...key,
					state: Producer.take(
						state,
						body.matchId !== undefined && body.resultCount !== undefined
							? { matchId: body.matchId, count: body.resultCount }
							: null,
					),
					expectedTakeId: state.takeId,
				});
				errorToastIfFalsy(replaced, STALE_TAKE_MESSAGE);
				break;
			}
			case "SHOW_RESULTS": {
				await BroadcastRepository.updateLiveResults({
					...key,
					liveResults: { matchId: body.matchId, count: body.resultCount },
				});
				break;
			}
			case "UPDATE_TEAM": {
				const defaults = notFoundIfNullish(
					await BroadcastSnapshot.findTeamValues({
						tournament,
						teamId: body.teamId,
					}),
				);

				await BroadcastRepository.updateTeamOverrides({
					...key,
					teamId: body.teamId,
					...TeamOverrides.fromSubmitted({
						defaults,
						submitted: {
							name: body.name,
							players: body.players.map((player) => ({
								userId: player.userId,
								name: player.name,
								weapons: player.weapons.map((weapon) => weapon.id),
							})),
						},
					}),
				});
				break;
			}
			case "RESET_TEAM": {
				const defaults = notFoundIfNullish(
					await BroadcastSnapshot.findTeamValues({
						tournament,
						teamId: body.teamId,
					}),
				);

				await BroadcastRepository.updateTeamOverrides({
					...key,
					teamId: body.teamId,
					...TeamOverrides.fromSubmitted({ defaults, submitted: defaults }),
				});
				break;
			}
			case "UPDATE_THEME": {
				await BroadcastRepository.updateSettings({
					...key,
					settings: { css: body.css ?? "" },
				});
				break;
			}
			default: {
				assertUnreachable(body);
			}
		}

		BroadcastHub.refresh({
			tournamentId: tournament.ctx.id,
			slug: channel.slug,
		});

		return null;
	},
);
