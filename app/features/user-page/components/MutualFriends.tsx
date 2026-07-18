import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import type { CommonUser } from "~/utils/kysely.server";
import { userPage } from "~/utils/urls";
import styles from "./MutualFriends.module.css";

const MAX_VISIBLE_AVATARS = 5;

export function MutualFriends({
	mutualFriends,
	withoutPopover = false,
}: {
	mutualFriends: Array<CommonUser>;
	/** When true renders a static avatar stack without the interactive popover, e.g. on the user card. */
	withoutPopover?: boolean;
}) {
	if (mutualFriends.length === 0) return null;

	if (withoutPopover) {
		return (
			<div className={styles.trigger}>
				<AvatarStack mutualFriends={mutualFriends} />
			</div>
		);
	}

	return (
		<div>
			<SendouPopover
				trigger={
					<SendouButton variant="minimal" size="small">
						<div className={styles.trigger}>
							<AvatarStack mutualFriends={mutualFriends} />
						</div>
					</SendouButton>
				}
			>
				<div className={styles.list}>
					{mutualFriends.map((friend) => (
						<Link
							key={friend.id}
							to={userPage(friend)}
							className={styles.friendLink}
						>
							<Avatar user={friend} size="xxs" />
							{friend.username}
						</Link>
					))}
				</div>
			</SendouPopover>
		</div>
	);
}

function AvatarStack({ mutualFriends }: { mutualFriends: Array<CommonUser> }) {
	const { t } = useTranslation(["user"]);

	const visibleFriends = mutualFriends.slice(0, MAX_VISIBLE_AVATARS);
	const overflowCount = mutualFriends.length - MAX_VISIBLE_AVATARS;

	return (
		<>
			<div className={styles.avatarStack}>
				{visibleFriends.map((friend) => (
					<Avatar
						key={friend.id}
						user={friend}
						size="xxs"
						className={styles.stackedAvatar}
					/>
				))}
			</div>
			{overflowCount > 0 ? (
				<span className={styles.overflow}>+{overflowCount}</span>
			) : null}
			<span>
				{t("user:mutualFriends.count", {
					count: mutualFriends.length,
				})}
			</span>
		</>
	);
}
