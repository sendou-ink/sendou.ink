import { zodResolver } from "@hookform/resolvers/zod";
import { useFetcher } from "@remix-run/react";
import * as React from "react";
import { type DefaultValues, FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { z } from "zod";
import { logger } from "~/utils/logger";
import type { ActionError } from "~/utils/remix.server";
import { SubmitButton } from "../SubmitButton";

export function MyForm<T extends z.ZodTypeAny>({
	schema,
	defaultValues,
	title,
	children,
}: {
	schema: T;
	defaultValues?: DefaultValues<z.infer<T>>;
	title?: string;
	children: React.ReactNode;
}) {
	const { t } = useTranslation(["common"]);
	const fetcher = useFetcher<any>();
	const methods = useForm<z.infer<T>>({
		resolver: zodResolver(schema),
		defaultValues,
	});

	if (methods.formState.isSubmitted && methods.formState.errors) {
		logger.error(methods.formState.errors);
	}

	React.useEffect(() => {
		if (!fetcher.data?.isError) return;

		const error = fetcher.data as ActionError;

		methods.setError(error.field as any, {
			message: error.msg,
		});
	}, [fetcher.data, methods.setError]);

	const onSubmit = React.useCallback(
		methods.handleSubmit((values) =>
			fetcher.submit(values, { method: "post", encType: "application/json" }),
		),
		[],
	);

	return (
		<FormProvider {...methods}>
			<fetcher.Form className="stack md-plus items-start" onSubmit={onSubmit}>
				{title ? <h1 className="text-lg">{title}</h1> : null}
				{children}
				<SubmitButton state={fetcher.state} className="mt-6">
					{t("common:actions.submit")}
				</SubmitButton>
			</fetcher.Form>
		</FormProvider>
	);
}
