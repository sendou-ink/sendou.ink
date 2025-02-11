import clsx from "clsx";
import { BskyIcon } from "~/components/icons/Bsky";
import { LinkIcon } from "~/components/icons/Link";
import { TwitchIcon } from "~/components/icons/Twitch";
import { YouTubeIcon } from "~/components/icons/YouTube";

export function SocialLinksList({ links }: { links: string[] }) {
	return (
		<div className="stack sm text-sm">
			{links.map((url, i) => {
				return <SocialLink key={i} url={url} />;
			})}
		</div>
	);
}

function SocialLink({ url }: { url: string }) {
	const type = urlToLinkType(url);

	return (
		<a href={url} target="_blank" rel="noreferrer" className="org__social-link">
			<div
				className={clsx("org__social-link__icon-container", {
					youtube: type === "youtube",
					twitch: type === "twitch",
					bsky: type === "bsky",
				})}
			>
				<SocialLinkIcon url={url} />
			</div>
			{url}
		</a>
	);
}

function SocialLinkIcon({ url }: { url: string }) {
	const type = urlToLinkType(url);

	if (type === "twitch") {
		return <TwitchIcon />;
	}

	if (type === "youtube") {
		return <YouTubeIcon />;
	}

	if (type === "bsky") {
		return <BskyIcon />;
	}

	return <LinkIcon />;
}

const urlToLinkType = (url: string) => {
	if (url.includes("twitch.tv")) {
		return "twitch";
	}

	if (url.includes("youtube.com")) {
		return "youtube";
	}

	if (url.includes("bsky.app")) {
		return "bsky";
	}

	return null;
};
