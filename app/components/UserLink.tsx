import clsx from "clsx";
import type * as React from "react";
import { Link } from "react-router";
import type { Tables } from "~/db/tables";
import { userPage } from "~/utils/urls";
import { Avatar } from "./Avatar";
import styles from "./UserLink.module.css";

type UserLinkUser = Pick<
	Tables["User"],
	"username" | "discordId" | "discordAvatar"
> & {
	customUrl?: Tables["User"]["customUrl"];
	customAvatarUrl?: string | null;
};

type UnlinkedPlayer = { name: string | null } & {
	[K in keyof UserLinkUser]: UserLinkUser[K] | null;
};

/** Avatar + username link; result players without an account render just their name. */
export function UserLink({
	user,
	size = "xxs",
	direction = "horizontal",
	className,
	children,
}: {
	user: UserLinkUser | UnlinkedPlayer;
	size?: React.ComponentProps<typeof Avatar>["size"];
	direction?: "horizontal" | "vertical";
	className?: string;
	/** Replaces the plain username text (avatar is always rendered) */
	children?: React.ReactNode;
}) {
	if (user.username === null) {
		return <>{(user as UnlinkedPlayer).name}</>;
	}

	const linkedUser = user as UserLinkUser;

	return (
		<Link
			to={userPage(linkedUser)}
			className={clsx(styles.userLink, className, {
				[styles.vertical]: direction === "vertical",
			})}
		>
			<Avatar user={linkedUser} size={size} />
			{children ?? linkedUser.username}
		</Link>
	);
}
