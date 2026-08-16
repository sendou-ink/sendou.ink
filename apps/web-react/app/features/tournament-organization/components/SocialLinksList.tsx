import clsx from "clsx";
import { Link } from "lucide-react";
import { BskyIcon } from "~/components/icons/Bsky";
import { TwitchIcon } from "~/components/icons/Twitch";
import { YouTubeIcon } from "~/components/icons/YouTube";
import styles from "../tournament-organization.module.css";

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
		<a
			href={url}
			target="_blank"
			rel="noreferrer"
			className={styles.socialLink}
		>
			<div
				className={clsx(styles.socialLinkIconContainer, {
					[styles.socialLinkYoutube]: type === "youtube",
					[styles.socialLinkTwitch]: type === "twitch",
					[styles.socialLinkBsky]: type === "bsky",
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

	return <Link />;
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
