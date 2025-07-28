import { m } from '$lib/paraglide/messages';

// 1 = support
// 2 = supporter
// 3 = supporter+
export const perks = [
	{
		id: 'supportMyWork',
		tier: 1,
		name: m['common:support.perk.supportMyWork'],
		extraInfo: false
	},
	{
		id: 'adFree',
		tier: 1,
		name: m['common:support.perk.adFree'],
		extraInfo: false
	},
	{
		id: 'nameInFooter',
		tier: 1,
		name: m['common:support.perk.nameInFooter'],
		extraInfo: false
	},
	{
		id: 'privateDiscord',
		tier: 2,
		name: m['common:support.perk.privateDiscord'],
		extraInfo: true
	},
	{
		id: 'prioritySupport',
		tier: 2,
		name: m['common:support.perk.prioritySupport'],
		extraInfo: true
	},
	{
		id: 'tournamentsBeta',
		tier: 2,
		name: m['common:support.perk.tournamentsBeta'],
		extraInfo: false
	},
	{
		id: 'previewQ',
		tier: 2,
		name: m['common:support.perk.previewQ'],
		extraInfo: false
	},
	{
		id: 'userShortLink',
		tier: 2,
		name: m['common:support.perk.userShortLink'],
		extraInfo: true
	},
	{
		id: 'autoValidatePictures',
		tier: 2,
		name: m['common:support.perk.autoValidatePictures'],
		extraInfo: true
	},
	{
		id: 'customizedColorsUser',
		tier: 2,
		name: m['common:support.perk.customizedColorsUser'],
		extraInfo: false
	},
	{
		id: 'favoriteBadges',
		tier: 2,
		name: m['common:support.perk.favoriteBadges'],
		extraInfo: true
	},
	{
		id: 'customizedColorsTeam',
		tier: 2,
		name: m['common:support.perk.customizedColorsTeam'],
		extraInfo: true
	},
	{
		id: 'badge',
		tier: 2,
		name: m['common:support.perk.badge'],
		extraInfo: false
	},
	{
		id: 'discordColorRole',
		tier: 2,
		name: m['common:support.perk.discordColorRole'],
		extraInfo: true
	},
	{
		id: 'chatColor',
		tier: 2,
		name: m['common:support.perk.chatColor'],
		extraInfo: false
	},
	{
		id: 'seePlusPercentage',
		tier: 2,
		name: m['common:support.perk.seePlusPercentage'],
		extraInfo: true
	},
	{
		id: 'joinFive',
		tier: 2,
		name: m['common:support.perk.joinFive'],
		extraInfo: false
	},
	{
		id: 'joinMoreAssociations',
		tier: 2,
		name: m['common:support.perk.joinMoreAssociations'],
		extraInfo: false
	},
	{
		id: 'useBotToLogIn',
		tier: 2,
		name: m['common:support.perk.useBotToLogIn'],
		extraInfo: true
	}
] as const;
