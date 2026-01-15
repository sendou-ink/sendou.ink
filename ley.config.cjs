const path = require("node:path");
require("dotenv").config();

module.exports = {
	database: process.env.DB_PATH,
	driver: path.join(__dirname, "ley-driver.cjs"),
};
