import { Image } from "~/components/Image";
import { LinkButton } from "~/components/elements/Button";
import { PlusIcon } from "~/components/icons/Plus";
import { navIconUrl } from "~/utils/urls";

import styles from "./AddNewButton.module.css";

interface AddNewButtonProps {
	to: string;
	navIcon: string;
}

export function AddNewButton({ to, navIcon }: AddNewButtonProps) {
	return (
		<LinkButton to={to} size="small" className={styles.addNewButton}>
			<span className={styles.iconsContainer}>
				<PlusIcon />
				<Image path={navIconUrl(navIcon)} size={18} alt="" />
			</span>
			<span className={styles.textContainer}>New</span>
		</LinkButton>
	);
}
