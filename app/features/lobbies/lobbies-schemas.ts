import { add, sub } from "date-fns";
import * as v from "valibot";
import {
	reportWeaponSchema,
	undoWeaponReportSchema,
} from "~/components/match-page/match-page-schemas";
import {
	checkboxGroup,
	datetime,
	radioGroup,
	select,
	stringConstant,
	textFieldOptional,
} from "~/form/fields";
import { modesShort } from "~/modules/in-game-lists/modes";
import { _action, coerceNumber, id, superRefine } from "~/utils/schema";
import {
	baseVisibilityField,
	notFoundVisibilityField,
	visibilityIssues,
} from "../associations/associations-schemas";
import {
	LOBBY_BEST_OFS,
	LOBBY_LABELS,
	LOBBY_NAME_MAX_LENGTH,
	LOBBY_ROOM_SIZES,
	LOBBY_SIDES,
} from "./lobbies-constants";

const bestOfField = radioGroup({
	label: "labels.lobbyBestOf",
	variant: "chip",
	items: LOBBY_BEST_OFS.map((bestOf) => ({
		label: () => `Bo${bestOf}`,
		value: String(bestOf) as `${(typeof LOBBY_BEST_OFS)[number]}`,
	})),
	initialValue: "3",
});

const modesField = checkboxGroup({
	label: "labels.lobbyModes",
	items: modesShort.map((mode) => ({
		label: `modes.${mode}` as const,
		value: mode,
	})),
	minLength: 1,
});

export const newLobbySchema = v.pipe(
	v.object({
		name: textFieldOptional({
			label: "labels.name",
			bottomText: "bottomTexts.lobbyName",
			maxLength: LOBBY_NAME_MAX_LENGTH,
		}),
		label: select({
			label: "labels.lobbyLabel",
			bottomText: "bottomTexts.lobbyLabel",
			items: LOBBY_LABELS.map((label) => ({
				label: `options.lobbyLabel.${label}` as const,
				value: label,
			})),
		}),
		startsAt: datetime({
			label: "labels.start",
			bottomText: "bottomTexts.lobbyStart",
			min: () => sub(new Date(), { minutes: 30 }),
			max: () => add(new Date(), { days: 14 }),
			minMessage: "errors.dateInPast",
			maxMessage: "errors.dateTooFarInFuture",
		}),
		bestOf: bestOfField,
		modes: modesField,
		roomSize: select({
			label: "labels.lobbyRoomSize",
			bottomText: "bottomTexts.lobbyRoomSize",
			items: LOBBY_ROOM_SIZES.map((roomSize) => ({
				label: () => String(roomSize),
				value: String(roomSize) as `${(typeof LOBBY_ROOM_SIZES)[number]}`,
			})),
		}),
		baseVisibility: baseVisibilityField,
		notFoundVisibility: notFoundVisibilityField,
	}),
	superRefine((lobby, ctx) => {
		for (const issue of visibilityIssues(lobby, {
			startsAt: lobby.startsAt,
			messages: {
				afterStart: "forms:errors.dateAfterLobbyStart",
				startingNow: "forms:errors.canNotSetIfStartingNow",
			},
		})) {
			ctx.addIssue(issue);
		}
	}),
);

export const lobbySettingsSchema = v.object({
	_action: stringConstant("UPDATE_SETTINGS"),
	bestOf: bestOfField,
	modes: modesField,
});

const lobbySide = v.picklist(LOBBY_SIDES);
const reportedCount = v.pipe(coerceNumber(), v.integer(), v.minValue(0));

export const lobbyActionSchema = v.union([
	v.object({ _action: _action("SIGN_UP") }),
	v.object({ _action: _action("CHECK_IN") }),
	v.object({ _action: _action("CONFIRM_READY") }),
	v.object({ _action: _action("LEAVE") }),
	v.object({ _action: _action("TOGGLE_DROP_AFTER_SET") }),
	v.object({
		_action: _action("REPORT_MAP"),
		setId: id,
		winnerSide: lobbySide,
		reportedCount,
	}),
	v.object({
		_action: _action("UNDO_MAP_REPORT"),
		setId: id,
		reportedCount,
	}),
	v.object({ _action: _action("CONFIRM_SET"), setId: id }),
	v.object({ _action: _action("DISPUTE_SET"), setId: id }),
	reportWeaponSchema,
	undoWeaponReportSchema,
	lobbySettingsSchema,
	v.object({ _action: _action("KICK"), userId: id }),
	v.object({ _action: _action("TOGGLE_SIT_OUT"), userId: id }),
	v.object({ _action: _action("END_LOBBY") }),
]);
