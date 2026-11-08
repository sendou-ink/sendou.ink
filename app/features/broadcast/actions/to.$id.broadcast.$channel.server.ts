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
import * as CastChannel from "../core/CastChannel";
import * as Producer from "../core/Producer";

const STALE_TAKE_MESSAGE =
	"Someone else already pressed Take. Check what is live now.";
const STALE_ITEM_MESSAGE =
	"That scene isn't staged anymore. Check what is live and queued now.";

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

		const updateProducer = async (
			change: Parameters<
				typeof BroadcastRepository.updateProducer
			>[0]["change"],
			staleMessage = STALE_ITEM_MESSAGE,
		) => {
			const isUpdated = await BroadcastRepository.updateProducer({
				...key,
				change,
			});
			errorToastIfFalsy(isUpdated, staleMessage);
		};
		const editItem = (itemId: number, patch: Producer.ItemPatch) =>
			updateProducer((state) => Producer.editItem(state, itemId, patch));

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
				await updateProducer(Producer.enqueue);
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
				await updateProducer(
					(state) =>
						state.takeId === body.takeId
							? Producer.take(state, { liveResults, now: Date.now() })
							: null,
					STALE_TAKE_MESSAGE,
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
			case "UPDATE_HEADLINE": {
				await BroadcastRepository.updateSettings({
					...key,
					patch: { headline: body.headline ?? "" },
				});
				break;
			}
			case "UPDATE_CASTERS": {
				await BroadcastRepository.updateSettings({
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
