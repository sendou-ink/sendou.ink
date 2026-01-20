const { load, MigrationError } = require("ley/lib/util");
const TEXT = require("ley/lib/text");

exports.connect = (opts = {}) => {
	const { database, ...rest } = opts;
	const Database = require("better-sqlite3");
	return new Database(database, rest);
};

exports.setup = async (client) => {
	client.prepare(TEXT.table.replace("serial", "integer")).run();
	return client.prepare("select name from migrations order by id asc").all();
};

exports.loop = async (client, files, method) => {
	const INSERT = client.prepare(
		"insert into migrations (name,created_at) values (?,current_timestamp)",
	);
	const DELETE = client.prepare("delete from migrations where name = ?");

	for (const obj of files) {
		const file = await load(obj.abs);
		if (typeof file[method] === "function") {
			await Promise.resolve(file[method](client)).catch((err) => {
				throw new MigrationError(err, obj);
			});
		}
		if (method === "up") {
			INSERT.run(obj.name);
		} else if (method === "down") {
			DELETE.run(obj.name);
		}
	}
};

exports.end = async (client) => {
	await client.close();
};
