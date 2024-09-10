import path from "path";
import fs from "fs";
import { Levels } from "log4js";
import ms from "ms";
import yaml from "yaml";
import Ajv from "ajv";
import formatsPlugin from "ajv-formats";

import config_schema from "../../config.schema.json";
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
		upload_dir: string;
	};
}

const ajv = new Ajv();
formatsPlugin(ajv);
const validate_config_yaml = ajv.compile(config_schema as unknown as JSONSchemaType<ConfigYAML>);
const config_path = "config.yaml";

/**
 * configuration-class
 */
class ConfigClass {
	private config_path!: string;

	private config!: ConfigYAML;

	private jwt_expire: number;

	/**
	 * instantize a configuration
	 * @param pth configuration file
	 */
	constructor(pth: string = config_path) {
		const open_result = this.open(pth);
		if (open_result) {
			const errors = open_result.map((error) => error.message).join("', '");

			throw new SyntaxError(`invalid config file: '${errors}'`);
		}

		this.jwt_expire = ms(this.config.client_session.expire);
	}

	/**
	 * load a configuration-file
	 * @param pth configuration-file
	 * @returns errors while parsing the file
	 */
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

	/**
	 * save the configuration-file
	 * @param pth save-path
	 */
	save(pth: string = this.config_path) {
		fs.writeFileSync(pth, yaml.stringify(this.config, undefined, "\t"));
	}

	/**
	 * @returns database-configuration
	 */
	get database(): DatabaseConnectionSettings {
		return structuredClone(this.config.database);
	}

	/**
	 * @returns JSON-webtoken secret
	 */
	get jwt_secret(): ConfigYAML["client_session"]["jwt_secret"] {
		return this.config.client_session.jwt_secret;
	}

	/**
	 * @returns duration unteil expire for the sessions in ms
	 */
	get session_expire(): number {
		return this.jwt_expire;
	}

	/**
	 * @returns configured log-level
	 */
	get log_level(): ConfigYAML["log_level"] {
		return structuredClone(this.config.log_level);
	}

	/**
	 * @returns setup-settings
	 */
	get setup(): ConfigYAML["setup"] {
		return structuredClone(this.config.setup);
	}

	/**
	 * @returns server-settings
	 */
	get server(): ConfigYAML["server"] {
		return structuredClone(this.config.server);
	}

	/**
	 * converts a client-path to a server-path for the upload-directory
	 * @param pth client-path
	 * @returns local-path
	 */
	get_upload_dir(pth: string): string {
		return path.join(this.server.upload_dir, pth);
	}
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const Config = new ConfigClass();
export default Config;
