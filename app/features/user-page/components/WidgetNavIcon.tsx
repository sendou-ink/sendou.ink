import { Image } from "~/components/Image";
import { navIconUrl } from "~/utils/urls";
import styles from "./WidgetNavIcon.module.css";

/** The icon of the page a widget is about, shown next to its name in the widget editor. */
export function WidgetNavIcon({ navItem }: { navItem?: string }) {
	if (!navItem) return null;

	return (
		<Image
			path={navIconUrl(navItem)}
			alt=""
			width={18}
			height={18}
			containerClassName={styles.widgetIcon}
		/>
	);
}
