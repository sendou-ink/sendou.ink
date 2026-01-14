import { X } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import type { ListedArt } from "~/features/art/art-types";
import { previewUrl } from "~/features/art/art-utils";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import { artPage, userArtPage } from "~/utils/urls";
import styles from "./WeaponArtPreview.module.css";

export function WeaponArtPreview({
	artPieces,
	weaponSlug,
}: {
	artPieces: ListedArt[];
	weaponSlug: string;
}) {
	const { t } = useTranslation(["common"]);
	const [bigArtId, setBigArtId] = React.useState<number | null>(null);

	if (artPieces.length === 0) return null;

	const bigArt = artPieces.find((art) => art.id === bigArtId);

	return (
		<section className={styles.container}>
			{bigArt ? (
				<BigImageDialog close={() => setBigArtId(null)} art={bigArt} />
			) : null}
			<div className={styles.header}>
				<h2 className={styles.title}>{t("common:weaponArt.title")}</h2>
				<Link to={artPage(weaponSlug)} className={styles.viewAll}>
					{t("common:actions.viewAll")}
				</Link>
			</div>
			<div className={styles.grid}>
				{artPieces.map((art) => (
					<ArtThumbnail
						key={art.id}
						art={art}
						onClick={() => setBigArtId(art.id)}
					/>
				))}
			</div>
		</section>
	);
}

function BigImageDialog({ close, art }: { close: () => void; art: ListedArt }) {
	const [imageLoaded, setImageLoaded] = React.useState(false);
	const { formatDate } = useTimeFormat();

	return (
		<SendouDialog
			heading={formatDate(databaseTimestampToDate(art.createdAt), {
				year: "numeric",
				month: "long",
				day: "numeric",
			})}
			onClose={close}
			isFullScreen
		>
			<img
				alt=""
				src={art.url}
				loading="lazy"
				className={styles.dialogImg}
				onLoad={() => setImageLoaded(true)}
			/>
			{art.author ? (
				<div
					className={styles.authorContainer}
					style={{ visibility: imageLoaded ? "visible" : "hidden" }}
				>
					<Link
						to={userArtPage(art.author, "MADE-BY")}
						className={styles.dialogAuthor}
					>
						<Avatar user={art.author} size="xxs" />
						<span>{art.author.username}</span>
					</Link>
				</div>
			) : null}
			<SendouButton
				variant="destructive"
				className="mx-auto mt-6"
				onPress={close}
				icon={<X />}
			>
				Close
			</SendouButton>
		</SendouDialog>
	);
}

function ArtThumbnail({
	art,
	onClick,
}: {
	art: ListedArt;
	onClick: () => void;
}) {
	return (
		<div className={styles.thumbnailContainer}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Biome v2 migration */}
			<img
				alt=""
				src={previewUrl(art.url)}
				loading="lazy"
				onClick={onClick}
				className={styles.thumbnailClickable}
			/>
		</div>
	);
}
