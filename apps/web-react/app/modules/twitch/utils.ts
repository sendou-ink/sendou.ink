export const twitchThumbnailUrlToSrc = (url: string) =>
	url.replace("{width}", "640").replace("{height}", "360");
