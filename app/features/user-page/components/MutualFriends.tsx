import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import type { CommonUser } from "~/utils/kysely.server";
import { userPage } from "~/utils/urls";
import styles from "./MutualFriends.module.css";

const MAX_VISIBLE_AVATARS = 5;

// xxx: for usercard do we even want popover there? or a different component, lighter data and no popover
export function MutualFriends({
	mutualFriends,
}: {
	mutualFriends: Array<CommonUser>;
}) {
	const { t } = useTranslation(["user"]);

	if (mutualFriends.length === 0) return null;

	const visibleFriends = mutualFriends.slice(0, MAX_VISIBLE_AVATARS);
	const overflowCount = mutualFriends.length - MAX_VISIBLE_AVATARS;

	return (
		<div>
			<SendouPopover
				trigger={
					<SendouButton variant="minimal" size="small">
						<div className={styles.trigger}>
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
