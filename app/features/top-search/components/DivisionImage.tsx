import { Image } from "~/components/Image";
import { brandImageUrl } from "~/utils/urls";
import type { XRankPlacementRegion } from "../top-search-types";
import styles from "./DivisionImage.module.css";

const TENTATEK_BRAND_ID = "B10";
const TAKOROKA_BRAND_ID = "B11";

/** X Rank division logo. Takoroka has a lighter variant for dark theme, `inverted` flips it for backgrounds contrasting the theme (e.g. a selected chip). */
export function DivisionImage({
	region,
	size,
	alt,
	inverted = false,
}: {
	region: XRankPlacementRegion;
	size: number;
	alt: string;
	inverted?: boolean;
}) {
	if (region === "WEST") {
		return (
			<Image path={brandImageUrl(TENTATEK_BRAND_ID)} size={size} alt={alt} />
		);
	}

	return (
		<>
			<Image
				path={brandImageUrl(TAKOROKA_BRAND_ID)}
				size={size}
				alt={alt}
				containerClassName={
					inverted ? styles.darkThemeOnly : styles.lightThemeOnly
				}
			/>
			<Image
				path={`${brandImageUrl(TAKOROKA_BRAND_ID)}-dark`}
				size={size}
				alt={alt}
				containerClassName={
					inverted ? styles.lightThemeOnly : styles.darkThemeOnly
				}
			/>
		</>
	);
}
