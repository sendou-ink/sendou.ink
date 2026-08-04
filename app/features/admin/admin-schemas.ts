import { z } from "zod";
import { friendCodeField } from "~/features/sendouq/q-schemas";
import {
	datetime,
	datetimeOptional,
	image,
	numberField,
	select,
	stringConstant,
	textField,
	textFieldOptional,
	userSearch,
} from "~/form/fields";
import { id } from "~/utils/zod";
import { BAN_REASON_MAX_LENGTH } from "./admin-constants";

const userField = userSearch({ label: "labels.user" });

export const friendCodeSearchSchema = z.object({
	friendCode: friendCodeField,
});

export const migrateUserSchema = z.object({
	_action: stringConstant("MIGRATE"),
	oldUser: userSearch({ label: "labels.adminOldUser" }),
	newUser: userSearch({
		label: "labels.adminNewUser",
		bottomText: "bottomTexts.adminMigrateNewUser",
	}),
});

export const linkPlayerSchema = z.object({
	_action: stringConstant("LINK_PLAYER"),
	user: userField,
	playerId: numberField({ label: "labels.adminPlayerId", min: 1 }),
});

export const giveArtistSchema = z.object({
	_action: stringConstant("ARTIST"),
	user: userField,
});

export const giveVideoAdderSchema = z.object({
	_action: stringConstant("VIDEO_ADDER"),
	user: userField,
});

export const giveTournamentOrganizerSchema = z.object({
	_action: stringConstant("TOURNAMENT_ORGANIZER"),
	user: userField,
});

export const giveApiAccessSchema = z.object({
	_action: stringConstant("API_ACCESS"),
	user: userField,
});

export const updateFriendCodeSchema = z.object({
	_action: stringConstant("UPDATE_FRIEND_CODE"),
	user: userField,
	friendCode: friendCodeField,
});

export const forcePatronSchema = z.object({
	_action: stringConstant("FORCE_PATRON"),
	user: userField,
	patronTier: select({
		label: "labels.patronTier",
		items: [
			{ value: "1", label: "options.patronTier.1" },
			{ value: "2", label: "options.patronTier.2" },
			{ value: "3", label: "options.patronTier.3" },
		],
	}),
	patronExpiresAt: datetime({ label: "labels.patronExpiresAt" }),
});

export const banUserSchema = z.object({
	_action: stringConstant("BAN_USER"),
	user: userField,
	expiresAt: datetimeOptional({
		label: "labels.banUserExpiresAt",
		bottomText: "bottomTexts.banUserExpiresAtHelp",
		min: () => new Date(),
		minMessage: "errors.dateInPast",
	}),
	reason: textFieldOptional({
		label: "labels.reason",
		maxLength: BAN_REASON_MAX_LENGTH,
	}),
});

export const unbanUserSchema = z.object({
	_action: stringConstant("UNBAN_USER"),
	user: userField,
});

export const refreshPlusTiersSchema = z.object({
	_action: stringConstant("REFRESH"),
});

export const adminActionSchema = z.union([
	migrateUserSchema,
	linkPlayerSchema,
	giveArtistSchema,
	giveVideoAdderSchema,
	giveTournamentOrganizerSchema,
	giveApiAccessSchema,
	updateFriendCodeSchema,
	forcePatronSchema,
	banUserSchema,
	unbanUserSchema,
	refreshPlusTiersSchema,
]);

export const createExternalStreamSchema = z.object({
	_action: stringConstant("CREATE"),
	name: textField({ label: "labels.name", maxLength: 64 }),
	url: textField({
		label: "labels.link",
		maxLength: 200,
		validate: "url",
	}),
	avatar: image({ label: "labels.logo", autoValidate: true }),
	startTime: datetime({ label: "labels.startTime" }),
});

const deleteExternalStreamSchema = z.object({
	_action: stringConstant("DELETE"),
	id,
});

export const externalStreamActionSchema = z.union([
	createExternalStreamSchema,
	deleteExternalStreamSchema,
]);
