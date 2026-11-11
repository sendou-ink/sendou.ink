import { add, sub } from "date-fns";
import * as v from "valibot";
import {
	reportWeaponSchema,
	undoWeaponReportSchema,
} from "~/components/match-page/match-page-schemas";
import {
	datetime,
	mapPoolOptional,
	radioGroup,
	select,
	stringConstant,
	textAreaOptional,
	textFieldOptional,
	toggle,
	tournamentSearchOptional,
} from "~/form/fields";
import {
	_action,
	coerceNumber,
	id,
	superRefine,
	type ValidationCtx,
} from "~/utils/schema";
import {
	baseVisibilityWithLinkOnlyField,
	notFoundVisibilityField,
} from "../associations/associations-schemas";
import * as Visibility from "../associations/core/Visibility";
import {
	LOBBY_BEST_OFS,
	LOBBY_DESCRIPTION_MAX_LENGTH,
	LOBBY_LABELS,
	LOBBY_NAME_MAX_LENGTH,
	LOBBY_SIDES,
	LOBBY_SPECTATOR_COUNTS,
	LOBBY_WEAPON_RANDOMIZERS,
	type LobbyMaps,
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

const weaponRandomizerField = radioGroup({
	label: "labels.lobbyWeaponRandomizer",
	bottomText: "bottomTexts.lobbyWeaponRandomizer",
	variant: "chip",
	items: LOBBY_WEAPON_RANDOMIZERS.map((randomizer) => ({
		label: `options.lobbyWeaponRandomizer.${randomizer}` as const,
		value: randomizer,
	})),
});

/** Messages of `Visibility.formIssues` for a lobby */
export const LOBBY_VISIBILITY_ISSUE_MESSAGES = {
	afterStart: "forms:errors.dateAfterLobbyStart",
	startingNow: "forms:errors.canNotSetIfStartingNow",
};

const mapsItems = [
	{ label: "options.scrimMaps.rankedOnly" as const, value: "RANKED" },
	{ label: "options.scrimMaps.szOnly" as const, value: "SZ" },
	{ label: "options.scrimMaps.allModes" as const, value: "ALL" },
	{ label: "options.scrimMaps.tournament" as const, value: "TOURNAMENT" },
	{ label: "options.lobbyMaps.custom" as const, value: "CUSTOM" },
] as const satisfies ReadonlyArray<{ label: string; value: LobbyMaps }>;

const mapsField = select({
	label: "labels.scrimMaps",
	bottomText: "bottomTexts.lobbyMaps",
	items: [...mapsItems],
});

const isApplicationRequiredField = toggle({
	label: "labels.lobbyIsApplicationRequired",
	bottomText: "bottomTexts.lobbyIsApplicationRequired",
});

const mapsFields = {
	maps: mapsField,
	mapsTournamentId: tournamentSearchOptional({
		label: "labels.scrimMapsTournament",
	}),
	mapPool: mapPoolOptional({ label: "labels.mapPool" }),
};

function mapsIssues(
	values: {
		maps: LobbyMaps;
		mapsTournamentId?: number | null;
		mapPool?: string;
	},
	ctx: ValidationCtx,
) {
	if (values.maps === "TOURNAMENT" && !values.mapsTournamentId) {
		ctx.addIssue({
			path: ["mapsTournamentId"],
			message: "forms:errors.tournamentMustBeSelected",
		});
	}
	if (values.maps === "CUSTOM" && !values.mapPool) {
		ctx.addIssue({ path: ["mapPool"], message: "forms:errors.required" });
	}
}

const nameField = textFieldOptional({
	label: "labels.name",
	bottomText: "bottomTexts.lobbyName",
	maxLength: LOBBY_NAME_MAX_LENGTH,
});

const descriptionField = textAreaOptional({
	label: "labels.description",
	maxLength: LOBBY_DESCRIPTION_MAX_LENGTH,
});

const labelField = select({
	label: "labels.lobbyLabel",
	bottomText: "bottomTexts.lobbyLabel",
	items: LOBBY_LABELS.map((label) => ({
		label: `options.lobbyLabel.${label}` as const,
		value: label,
	})),
});

export const newLobbySchema = v.pipe(
	v.object({
		name: nameField,
		description: descriptionField,
		label: labelField,
		startsAt: datetime({
			label: "labels.start",
			bottomText: "bottomTexts.lobbyStart",
			min: () => sub(new Date(), { minutes: 30 }),
			max: () => add(new Date(), { days: 14 }),
			minMessage: "errors.dateInPast",
			maxMessage: "errors.dateTooFarInFuture",
		}),
		bestOf: bestOfField,
		...mapsFields,
		weaponRandomizer: weaponRandomizerField,
		spectators: radioGroup({
			label: "labels.lobbySpectators",
			bottomText: "bottomTexts.lobbySpectators",
			variant: "chip",
			items: LOBBY_SPECTATOR_COUNTS.map((count) => ({
				label: () => String(count),
				value: String(count) as `${(typeof LOBBY_SPECTATOR_COUNTS)[number]}`,
			})),
		}),
		isApplicationRequired: isApplicationRequiredField,
		baseVisibility: baseVisibilityWithLinkOnlyField,
		notFoundVisibility: notFoundVisibilityField,
	}),
	superRefine((lobby, ctx) => {
		mapsIssues(lobby, ctx);
		for (const issue of Visibility.formIssues(lobby, {
			startsAt: lobby.startsAt,
			messages: LOBBY_VISIBILITY_ISSUE_MESSAGES,
		})) {
			ctx.addIssue(issue);
		}
	}),
);

/** The settings of {@link newLobbySchema} the host can change later, its visibility checked against the lobby's start by the action, see `Visibility.formIssues`. */
export const editLobbySchema = v.pipe(
	v.object({
		_action: stringConstant("EDIT"),
		name: nameField,
		description: descriptionField,
		label: labelField,
		bestOf: bestOfField,
		...mapsFields,
		weaponRandomizer: weaponRandomizerField,
		isApplicationRequired: isApplicationRequiredField,
		baseVisibility: baseVisibilityWithLinkOnlyField,
		notFoundVisibility: notFoundVisibilityField,
	}),
	superRefine((values, ctx) => mapsIssues(values, ctx)),
);

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
	v.object({ _action: _action("HOST_CONFIRM_SET"), setId: id }),
	reportWeaponSchema,
	undoWeaponReportSchema,
	editLobbySchema,
	v.object({ _action: _action("RESET_SHARE_KEY") }),
	v.object({ _action: _action("WITHDRAW_APPLICATION") }),
	v.object({ _action: _action("APPROVE_APPLICATION"), userId: id }),
	v.object({ _action: _action("DENY_APPLICATION"), userId: id }),
	v.object({ _action: _action("KICK"), userId: id }),
	v.object({ _action: _action("TOGGLE_SIT_OUT"), userId: id }),
	v.object({ _action: _action("MAKE_HOST"), userId: id }),
	v.object({ _action: _action("END_LOBBY") }),
]);
