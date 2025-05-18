export function Table({ children }: { children: React.ReactNode }) {
	return (
		<div className="my-table__container">
			<table className="my-table">{children}</table>
		</div>
	);
}
