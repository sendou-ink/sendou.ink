const path = require("node:path");

try {
	process.loadEnvFile();
} catch {
	// .env is optional; in production DB_PATH comes from the host environment
}

module.exports = {
	database: process.env.DB_PATH,
	driver: path.join(__dirname, "ley-driver.cjs"),
};
