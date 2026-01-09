import * as React from "react";
import {
	Dialog,
	DialogTrigger,
	Input,
	ListBox,
	ListBoxItem,
	Modal,
	ModalOverlay,
} from "react-aria-components";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { SearchIcon } from "~/components/icons/Search";
import styles from "./CommandPalette.module.css";

// xxx: placeholder

const MOCK_RESULTS = [
	{ id: "builds", label: "Builds", href: "/builds" },
	{ id: "calendar", label: "Calendar", href: "/calendar" },
	{ id: "sendouq", label: "SendouQ", href: "/q" },
	{ id: "vods", label: "VODs", href: "/vods" },
	{ id: "maps", label: "Maps", href: "/maps" },
];

export function CommandPalette() {
	const { t } = useTranslation(["common"]);
	const [isOpen, setIsOpen] = React.useState(false);

	return (
		<DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
			<button
				type="button"
				className={styles.searchButton}
				onClick={() => setIsOpen(true)}
			>
				<SearchIcon className={styles.searchIcon} />
				<span className={styles.searchPlaceholder}>{t("common:search")}</span>
				<kbd className={styles.searchKbd}>Ctrl+K</kbd>
			</button>
			<ModalOverlay className={styles.overlay}>
				<Modal className={styles.modal}>
					<Dialog className={styles.dialog} aria-label={t("common:search")}>
						<CommandPaletteContent onClose={() => setIsOpen(false)} />
					</Dialog>
				</Modal>
			</ModalOverlay>
		</DialogTrigger>
	);
}

function CommandPaletteContent({ onClose }: { onClose: () => void }) {
	const { t } = useTranslation(["common"]);
	const navigate = useNavigate();
	const [query, setQuery] = React.useState("");

	const filteredResults = query
		? MOCK_RESULTS.filter((r) =>
				r.label.toLowerCase().includes(query.toLowerCase()),
			)
		: MOCK_RESULTS;

	const handleSelect = (key: React.Key) => {
		const result = MOCK_RESULTS.find((r) => r.id === key);
		if (result) {
			navigate(result.href);
			onClose();
		}
	};

	return (
		<>
			<div className={styles.inputContainer}>
				<SearchIcon className={styles.inputIcon} />
				<Input
					className={styles.input}
					placeholder={t("common:search.placeholder")}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					autoFocus
				/>
			</div>
			<ListBox
				className={styles.listBox}
				aria-label={t("common:search")}
				selectionMode="single"
				onAction={handleSelect}
			>
				{filteredResults.map((result) => (
					<ListBoxItem
						key={result.id}
						id={result.id}
						className={styles.listBoxItem}
					>
						{result.label}
					</ListBoxItem>
				))}
			</ListBox>
		</>
	);
}
