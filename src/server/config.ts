import fs from "fs";
import { Levels } from "log4js";
import ms from "ms";
import yaml from "yaml";

import config_schema from "../../config_schema.json";
import { ajv } from "./lib";
import { ErrorObject, JSONSchemaType } from "ajv";

export interface DatabaseConnectionSettings {
	host: string;
	user: string;
	password: string;
	database: string;
}

export interface ConfigYAML {
	log_level: keyof Levels;
	database: DatabaseConnectionSettings;
	client_session: {
		jwt_secret: string;
		expire: string;
	};
	setup: {
		start: string;
		days: number;
	};
	server: {
		port: number;
	};
}

const validate_config_yaml = ajv.compile(config_schema as unknown as JSONSchemaType<ConfigYAML>);
const config_path = "config.yaml";
class ConfigClass {
	private config_path!: string;

	private config!: ConfigYAML;

	private jwt_expire: number;

	constructor(pth: string = config_path) {
		const open_result = this.open(pth);
		if (open_result) {
			const errors = open_result.map((error) => error.message).join("', '");

			throw new SyntaxError(`invalid config file: '${errors}'`);
		}

		this.jwt_expire = ms(this.config.client_session.expire);
	}

	open(pth: string = config_path): null | ErrorObject[] {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const new_config = yaml.parse(fs.readFileSync(pth, "utf-8"));

		if (validate_config_yaml(new_config)) {
			this.config_path = pth;

			this.config = new_config;

			return null;
		} else {
			return validate_config_yaml.errors ?? null;
		}
	}

	save(pth: string = this.config_path) {
		fs.writeFileSync(pth, JSON.stringify(this.config, undefined, "\t"));
	}

	get database(): DatabaseConnectionSettings {
		return structuredClone(this.config.database);
	}

	get jwt_secret(): ConfigYAML["client_session"]["jwt_secret"] {
		return this.config.client_session.jwt_secret;
	}

	get session_expire(): number {
		return this.jwt_expire;
	}

	get log_level(): ConfigYAML["log_level"] {
		return structuredClone(this.config.log_level);
	}

	get setup(): ConfigYAML["setup"] {
		return structuredClone(this.config.setup);
	}

	get server(): ConfigYAML["server"] {
		return structuredClone(this.config.server);
	}
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Config = new ConfigClass();
export default Config;
