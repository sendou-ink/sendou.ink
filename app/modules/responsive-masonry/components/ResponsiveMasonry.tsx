// adapted from https://github.com/cedricdelpoux/react-responsive-masonry

import React from "react";
import { useMediaQuery } from "~/hooks/useMediaQuery";
import Masonry from "./Masonry";

const THREE_COLUMNS_QUERY = "(width >= 900px)";
const TWO_COLUMNS_QUERY = "(width >= 750px)";

const MasonryResponsive = ({
	children,
}: {
	children: React.ReactNode | React.ReactNode[];
}) => {
	const columnsCount = useColumnsCount();

	return (
		<div>
			{React.Children.map(children, (child, index) =>
				React.cloneElement(child as React.ReactElement<any>, {
					key: index,
					columnsCount,
				}),
			)}
		</div>
	);
};

export function ResponsiveMasonry({ children }: { children: React.ReactNode }) {
	return (
		<MasonryResponsive>
			<Masonry gutter="1rem">{children}</Masonry>
		</MasonryResponsive>
	);
}

function useColumnsCount() {
	const threeColumns = useMediaQuery(THREE_COLUMNS_QUERY);
	const twoColumns = useMediaQuery(TWO_COLUMNS_QUERY);

	if (threeColumns) return 3;
	if (twoColumns) return 2;
	return 1;
}
