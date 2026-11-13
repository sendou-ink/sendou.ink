import { requireUser } from "~/features/auth/core/user.server";
import * as BroadcastRepository from "~/features/broadcast/BroadcastRepository.server";
import { broadcastParamsSchema } from "~/features/broadcast/broadcast-schemas";
import type { BroadcastStoredState } from "~/features/broadcast/broadcast-types";
import {
	regenerateProgramKey,
	requireBroadcastProducer,
} from "~/features/broadcast/broadcast-utils.server";
import * as BroadcastHub from "~/features/broadcast/core/BroadcastHub.server";
import * as Producer from "~/features/broadcast/core/Producer";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { defineAction } from "~/form/define-action.server";
import { errorToastIfFalsy, notFoundIfNullish } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { CAST_PRODUCER_RULES } from "../broadcast-cast-constants";
import { broadcastActionSchema } from "../broadcast-cast-schemas";
import type {
	CastBroadcastSettings,
	CastProducerState,
} from "../broadcast-cast-types";
import * as CastChannel from "../core/CastChannel";

const STALE_TAKE_MESSAGE =
	"Someone else already pressed Take. Check what is live now.";
const STALE_ITEM_MESSAGE =
	"That scene isn't staged anymore. Check what is live and queued now.";
const NO_MATCH_MESSAGE =
	"That scene shows the match's teams, but no match is cast on this channel. Pick another scene.";

export const action = defineAction(
	{ params: broadcastParamsSchema, body: broadcastActionSchema },
	async ({ params, body }) => {
		const user = requireUser();
		const tournament = await tournamentFromDB(params.id);
		requireBroadcastProducer(tournament, user);

		const channel = notFoundIfNullish(
			CastChannel.findBySlug(tournament.ctx.castAccounts, params.channel),
		);
		const key = {
			tournamentId: tournament.ctx.id,
			channel,
			rules: CAST_PRODUCER_RULES,
		};
		const hasMatch =
			CastChannel.featuredMatchId({
				castedMatchesInfo: tournament.ctx.castedMatchesInfo,
				channel,
			}) !== null;

		const updateProducer = async (
			change: (
				state: BroadcastStoredState<CastProducerState>,
			) => BroadcastStoredState<CastProducerState> | null,
			staleMessage = STALE_ITEM_MESSAGE,
		) => {
			const isUpdated = await BroadcastRepository.updateProducer({
				...key,
				change,
			});
			errorToastIfFalsy(isUpdated, staleMessage);
		};
		const editItem = (
			itemId: number,
			patch: Producer.ItemPatch<CastProducerState>,
		) =>
			updateProducer((state) =>
				Producer.editItem(CAST_PRODUCER_RULES, state, itemId, patch),
			);

		switch (body._action) {
			case "SET_SCENE": {
				await editItem(body.itemId, { scene: body.scene });
				break;
			}
			case "SET_TRANSITION": {
				await editItem(body.itemId, { transition: body.transition });
				break;
			}
			case "SET_INK": {
				await BroadcastRepository.updateState({
					...key,
					patch: {
						ink: body.key
							? {
									key: body.key,
									isFlipped: body.isFlipped,
									matchId: body.matchId,
									resultCount: body.resultCount,
								}
							: null,
					},
				});
				break;
			}
			case "SET_SWAP_SIDES": {
				await editItem(body.itemId, { swapSides: body.swapSides });
				break;
			}
			case "SET_BRACKET": {
				await editItem(body.itemId, { bracketIdx: body.bracketIdx ?? null });
				break;
			}
			case "SET_BRACKET_FOCUS": {
				await editItem(body.itemId, { bracketFocus: body.focus });
				break;
			}
			case "SET_TEAM": {
				await editItem(body.itemId, { teamPick: body.teamPick });
				break;
			}
			case "SET_CLIP": {
				await editItem(body.itemId, { clipId: body.clipId ?? null });
				break;
			}
			case "SET_DURATION": {
				await editItem(body.itemId, { durationMs: body.durationMs ?? null });
				break;
			}
			case "SET_ADVANCE": {
				await editItem(body.itemId, { advance: body.advance });
				break;
			}
			case "ADD_TO_QUEUE": {
				await updateProducer((state) =>
					Producer.enqueue(CAST_PRODUCER_RULES, state, { hasMatch }),
				);
				break;
			}
			case "REMOVE_FROM_QUEUE": {
				await updateProducer((state) =>
					Producer.removeItem(state, body.itemId),
				);
				break;
			}
			case "MOVE_IN_QUEUE": {
				await updateProducer((state) =>
					Producer.moveItem(state, body.itemId, body.direction),
				);
				break;
			}
			case "TAKE": {
				const liveResults =
					body.matchId !== undefined && body.resultCount !== undefined
						? { matchId: body.matchId, count: body.resultCount }
						: null;
				let isMissingMatch = false;
				const isTaken = await BroadcastRepository.updateProducer({
					...key,
					change: (state) => {
						if (state.takeId !== body.takeId) return null;
						if (!Producer.canTake(CAST_PRODUCER_RULES, state, { hasMatch })) {
							isMissingMatch = true;
							return null;
						}

						return Producer.take(CAST_PRODUCER_RULES, state, {
							liveResults,
							now: Date.now(),
							hasMatch,
						});
					},
				});
				errorToastIfFalsy(
					isTaken,
					isMissingMatch ? NO_MATCH_MESSAGE : STALE_TAKE_MESSAGE,
				);
				break;
			}
			case "SHOW_RESULTS": {
				await BroadcastRepository.updateState({
					...key,
					patch: {
						liveResults: { matchId: body.matchId, count: body.resultCount },
					},
				});
				break;
			}
			case "UPDATE_THEME": {
				await BroadcastRepository.updateSettings({
					...key,
					patch: { css: body.css ?? "", weaponImages: body.weaponImages },
				});
				break;
			}
			case "UPDATE_GAME_DELAY": {
				await BroadcastRepository.updateSettings({
					...key,
					patch: { gameDelayMs: body.gameDelayMs },
				});
				break;
			}
			case "UPDATE_HEADLINE": {
				await BroadcastRepository.updateSettings<CastBroadcastSettings>({
					...key,
					patch: { headline: body.headline ?? "" },
				});
				break;
			}
			case "GENERATE_PROGRAM_KEY": {
				await regenerateProgramKey(key);
				break;
			}
			case "UPDATE_CASTERS": {
				await BroadcastRepository.updateSettings<CastBroadcastSettings>({
					...key,
					patch: { casterIds: body.casterIds },
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
