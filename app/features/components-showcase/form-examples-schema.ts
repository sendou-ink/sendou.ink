import * as v from "valibot";
import {
	checkboxGroup,
	customField,
	datetime,
	datetimeOptional,
	dayMonthYear,
	dualSelectOptional,
	image,
	numberFieldOptional,
	radioGroup,
	select,
	selectDynamicOptional,
	selectOptional,
	stageSelect,
	textArea,
	textAreaOptional,
	textField,
	textFieldOptional,
	timeRangeOptional,
	toggle,
	userSearchOptional,
	weaponPool,
	weaponSelectOptional,
} from "~/form/fields";

export const formFieldsShowcaseSchema = v.object({
	requiredText: textField({
		label: "labels.name",
		maxLength: 100,
	}),
	optionalText: textFieldOptional({
		label: "labels.bio",
		maxLength: 200,
	}),
	optionalNumber: numberFieldOptional({
		label: "labels.vodTeamSize",
	}),

	requiredTextArea: textArea({
		label: "labels.description",
		maxLength: 500,
	}),
	optionalTextArea: textAreaOptional({
		label: "labels.text",
		maxLength: 1000,
	}),

	isPublic: toggle({
		label: "labels.buildPrivate",
	}),
	enableNotifications: toggle({
		label: "labels.isEstablished",
	}),

	requiredSelect: select({
		label: "labels.voiceChat",
		items: [
			{ label: "options.voiceChat.yes", value: "YES" },
			{ label: "options.voiceChat.no", value: "NO" },
			{ label: "options.voiceChat.listenOnly", value: "LISTEN_ONLY" },
		],
	}),
	optionalSelect: selectOptional({
		label: "labels.type",
		items: [
			{ label: "vodTypes.TOURNAMENT", value: "TOURNAMENT" },
			{ label: "vodTypes.CAST", value: "CAST" },
			{ label: "vodTypes.SCRIM", value: "SCRIM" },
		],
	}),
	dynamicSelect: selectDynamicOptional({
		label: "labels.orgSeries",
	}),
	divisionRange: dualSelectOptional({
		fields: [
			{
				label: "labels.scrimMaxDiv",
				items: [
					{ label: () => "S+", value: "S+" },
					{ label: () => "S", value: "S" },
					{ label: () => "A", value: "A" },
					{ label: () => "B", value: "B" },
				],
			},
			{
				label: "labels.scrimMinDiv",
				items: [
					{ label: () => "S+", value: "S+" },
					{ label: () => "S", value: "S" },
					{ label: () => "A", value: "A" },
					{ label: () => "B", value: "B" },
				],
			},
		],
	}),

	matchType: radioGroup({
		label: "labels.scrimMaps",
		items: [
			{ label: "options.scrimMaps.noPreference", value: "NO_PREFERENCE" },
			{ label: "options.scrimMaps.szOnly", value: "SZ_ONLY" },
			{ label: "options.scrimMaps.rankedOnly", value: "RANKED_ONLY" },
		],
	}),
	selectedModes: checkboxGroup({
		label: "labels.buildModes",
		items: [
			{ label: "modes.SZ", value: "SZ" },
			{ label: "modes.TC", value: "TC" },
			{ label: "modes.RM", value: "RM" },
			{ label: "modes.CB", value: "CB" },
		],
	}),

	requiredDatetime: datetime({
		label: "labels.startTime",
	}),
	optionalDatetime: datetimeOptional({
		label: "labels.vodDate",
	}),
	birthDate: dayMonthYear({
		label: "labels.banUserExpiresAt",
	}),
	availableTime: timeRangeOptional({
		label: "labels.weekdayTimes",
		startLabel: "labels.start",
		endLabel: "labels.end",
	}),

	weapons: weaponPool({
		label: "labels.weaponPool",
		maxCount: 5,
		minCount: 0,
	}),
	stage: stageSelect({
		label: "labels.vodStage",
	}),
	weapon: weaponSelectOptional({
		label: "labels.vodWeapon",
	}),
	user: userSearchOptional({
		label: "labels.player",
	}),

	logo: image({
		label: "labels.logo",
	}),
	banner: image({
		label: "labels.banner",
		dimensions: "thick-banner",
	}),

	customValue: customField(
		{ initialValue: "custom initial value" },
		v.optional(v.string()),
	),
});
