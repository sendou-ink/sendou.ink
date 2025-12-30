import { useActionData } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import type { Namespace } from "~/modules/i18n/resources.server";
import styles from "./FormErrors.module.css";

export function FormErrors({ namespace }: { namespace: Namespace }) {
	const { t } = useTranslation(["common", namespace]);
	const actionData = useActionData<{ errors?: string[] }>();

	if (!actionData?.errors || actionData.errors.length === 0) {
		return null;
	}

	return (
		<div className={styles.container}>
			<h4>{t("common:forms.errors.title")}:</h4>
			<ol>
				{actionData.errors.map((error) => (
					<li key={error}>{t(`${namespace}:${error}` as any)}</li>
				))}
			</ol>
		</div>
	);
}
