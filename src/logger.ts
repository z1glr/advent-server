import * as log4js from "log4js";
import Config from "./config";

log4js.configure({
	appenders: {
		log_file: {
			type: "file",
			filename:
				"logs/server_log." + new Date().toISOString().slice(0, 19).replaceAll(":", "-") + ".log"
		},
		console: { type: "console" }
	},
	categories: {
		default: { appenders: ["log_file", "console"], level: Config.log_level }
	}
});

export const logger = log4js.getLogger();
