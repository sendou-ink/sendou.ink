import clsx from "clsx";
import { Pencil as EditIcon, Puzzle as PuzzleIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	href,
	useLoaderData,
	useMatches,
	useOutletContext,
} from "react-router";
import { Avatar } from "~/components/Avatar";
import { LinkButton } from "~/components/elements/Button";
import { Flag } from "~/components/Flag";
import { useUser } from "~/features/auth/core/user";
import { UserCard } from "~/features/user-card/components/UserCard";
import { countryCodeToTranslatedName } from "~/utils/i18n";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { MutualFriends } from "../components/MutualFriends";
import type { UserPageNavItem } from "../components/UserPageIconNav";
import { UserPageIconNav } from "../components/UserPageIconNav";
import { Widget } from "../components/Widget";
import { loader } from "../loaders/u.$identifier.index.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
import styles from "./u.$identifier.index.module.css";

export { loader };

export const handle: SendouRouteHandle = {
	i18n: [
		"badges",
		"team",
		"org",
		"vods",
		"lfg",
		"builds",
		"weapons",
		"gear",
		"game-badges",
		"analyzer",
		"trophies",
	],
};

export default function UserInfoPage() {
	const { t, i18n } = useTranslation(["user"]);
	const data = useLoaderData<typeof loader>();
	const user = useUser();
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as UserPageLoaderData;
	const { navItems } = useOutletContext<{ navItems: UserPageNavItem[] }>();

	const mainWidgets = data.widgets.filter((w) => w.slot === "main");
	const sideWidgets = data.widgets.filter((w) => w.slot === "side");

	const isOwnPage = layoutData.user.id === user?.id;

	return (
		<div className={styles.container}>
			<div className="stack sm">
				<div className={styles.header}>
					<UserCard userId={layoutData.user.id}>
						<Avatar user={layoutData.user} size="xmd" loading="eager" />
					</UserCard>
					<div className={styles.userInfo}>
						<div className={styles.nameGroup}>
							<h1 className={styles.username}>
								<UserCard userId={layoutData.user.id}>
									{layoutData.user.username}
								</UserCard>
							</h1>
							<ProfileSubtitle
								inGameName={layoutData.user.inGameName}
								pronouns={layoutData.user.pronouns}
								plusTier={layoutData.user.plusTier}
								country={layoutData.user.country}
								language={i18n.language}
							/>
						</div>
					</div>
					<div className={styles.desktopIconNav}>
						<UserPageIconNav items={navItems} />
					</div>
				</div>
				<MutualFriends mutualFriends={layoutData.mutualFriends} />
			</div>
			{isOwnPage ? (
				<div className={styles.editButtons}>
					<LinkButton
						to={href("/u/:identifier/edit-widgets", {
							identifier:
								layoutData.user.customUrl ?? layoutData.user.discordId,
						})}
						variant="outlined"
						size="small"
						icon={<PuzzleIcon />}
					>
						{t("user:widgets.edit")}
					</LinkButton>
					<LinkButton
						to={href("/u/:identifier/edit", {
							identifier:
								layoutData.user.customUrl ?? layoutData.user.discordId,
						})}
						variant="outlined"
						size="small"
						icon={<EditIcon />}
					>
						{t("user:widgets.editProfile")}
					</LinkButton>
				</div>
			) : null}

			<div className={styles.mobileIconNav}>
				<UserPageIconNav items={navItems} />
			</div>

			<div className={styles.widgets}>
				<div className={clsx(styles.side, "scrollbar")}>
					{sideWidgets.map((widget) => (
						<Widget key={widget.id} widget={widget} user={layoutData.user} />
					))}
				</div>
				<div className={styles.main}>
					{mainWidgets.map((widget) => (
						<Widget key={widget.id} widget={widget} user={layoutData.user} />
					))}
				</div>
			</div>
		</div>
	);
}

function ProfileSubtitle({
	inGameName,
	pronouns,
	plusTier,
	country,
	language,
}: {
	inGameName: string | null;
	pronouns: { subject: string; object: string } | null;
	plusTier: number | null;
	country: string | null;
	language: string;
}) {
	const parts: React.ReactNode[] = [];

	if (inGameName) {
		parts.push(inGameName);
	}

	if (plusTier) {
		parts.push(`+${plusTier}`);
	}

	if (pronouns) {
		parts.push(`${pronouns.subject}/${pronouns.object}`);
	}

	if (country) {
		parts.push(
			<span key="country" className="stack horizontal xs items-center">
				<Flag countryCode={country} tiny />
				{countryCodeToTranslatedName({ countryCode: country, language })}
			</span>,
		);
	}

	if (parts.length === 0) return null;

	return (
		<div className={styles.subtitle}>
			{parts.map((part, i) => (
				<span key={i} className="stack horizontal xs items-center">
					{i > 0 ? <span>·</span> : null}
					{part}
				</span>
			))}
		</div>
	);
}
