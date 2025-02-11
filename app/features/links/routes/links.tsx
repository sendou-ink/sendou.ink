import type { MetaFunction } from "@remix-run/node";
import { Main } from "~/components/Main";
import { DiscordIcon } from "~/components/icons/Discord";
import { YouTubeIcon } from "~/components/icons/YouTube";
import { metaTags } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { LINKS_PAGE, navIconUrl } from "~/utils/urls";
import links from "../links.json";

export const handle: SendouRouteHandle = {
	breadcrumb: () => ({
		imgPath: navIconUrl("links"),
		href: LINKS_PAGE,
		type: "IMAGE",
	}),
};

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Links",
		ogTitle: "Splatoon link collection",
		description:
			"Collection of useful Splatoon guides, Discord servers and other resources.",
		location: args.location,
	});
};

export default function LinksPage() {
	return (
		<Main>
			<div className="stack md">
				{links
					.sort((a, b) => a.title.localeCompare(b.title))
					.map((link) => {
						const isDiscord = link.url.includes("discord");
						const isYoutube = link.url.includes("youtube");

						return (
							<div key={link.url}>
								<h2 className="text-sm">
									<a
										href={link.url}
										target="_blank"
										rel="noopener noreferrer"
										className="stack sm horizontal items-center"
									>
										{link.title}
										{isDiscord ? (
											<DiscordIcon className="discord-icon" />
										) : null}
										{isYoutube ? (
											<YouTubeIcon className="youtube-icon" />
										) : null}
									</a>
								</h2>
								<div className="text-sm text-lighter">{link.description}</div>
							</div>
						);
					})}
			</div>
		</Main>
	);
}
