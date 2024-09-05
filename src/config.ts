import fs from "fs";
import { Levels } from "log4js";
import ms from "ms";
import path from "path";
import yaml from "yaml";

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
		expire: number;
	};
	setup: {
		start: string;
		days: number;
	}
}

const config_path = "config.yaml";

// validate the config file
const config_template: ConfigYAML = {
	log_level: "INFO",
	database: {
		database: "db",
		host: "localhost",
		password: "password",
		user: "user"
	},
	client_session: {
		expire: 1,
		jwt_secret: "secret"
	},
	setup: {
		days: 1,
		start: "1970-01-01"
	}
};

class ConfigClass {
	private config_path!: string;

	private config!: ConfigYAML;

	constructor(pth: string = config_path) {
		if (!this.open(pth)) {
			throw new SyntaxError("invalid config file");
		}
	}

	open(pth: string = config_path): boolean {
		const new_config = yaml.parse(fs.readFileSync(pth, "utf-8"));

		new_config.client_session.expire = ms(new_config.client_session.expire);

		if (this.check_config(new_config)) {
			this.config_path = pth;

			this.config = new_config;

			return true;
		} else {
			return false;
		}
	}

	reload(): boolean {
		return this.open(this.config_path);
	}

	save(pth: string = this.config_path) {
		fs.writeFileSync(pth, JSON.stringify(this.config, undefined, "\t"));
	}

	private check_config(config: ConfigYAML): boolean {
		let file_check = recurse_object_check(config, config_template);

		file_check &&= [
			"ALL",
			"MARK",
			"TRACE",
			"DEBUG",
			"INFO",
			"WARN",
			"ERROR",
			"FATAL",
			"OFF"
		].includes(config?.log_level);

		file_check &&= config.client_session.expire > 0;

		file_check &&= config.setup.days > 0;

		file_check &&= !isNaN(Number(new Date(config.setup.start)));

		return file_check;
	}
	
	get database(): DatabaseConnectionSettings {
		return structuredClone(this.config.database);
	}

	get jwt_secret(): ConfigYAML["client_session"]["jwt_secret"] {
		return this.config.client_session.jwt_secret;
	}

	get session_expire(): ConfigYAML["client_session"]["expire"] {
		return this.config.client_session.expire;
	}

	get log_level(): ConfigYAML["log_level"] {
		return structuredClone(this.config.log_level);
	}

	get setup(): ConfigYAML["setup"] {
		return structuredClone(this.config.setup);
	}
}

export function recurse_object_check<K>(obj: K, template: K): boolean {
	if (typeof obj === "object" && typeof template === "object") {
		const results: boolean[] = [];

		if (Array.isArray(obj) && Array.isArray(template)) {
			results.push(
				...obj.map((ele): boolean => {
					return recurse_object_check(ele, template[0]);
				})
			);
			// check that none of them are arrays
		} else if (!(Array.isArray(obj) || Array.isArray(template))) {
			const obj_keys = Object.keys(obj as object);

			results.push(
				...Object.entries(template as object).map(([key, item]): boolean => {
					if (obj_keys.includes(key)) {
						return recurse_object_check(item, (template as Record<string, unknown>)[key]);
					} else {
						return false;
					}
				})
			);
		} else {
			return false;
		}

		return results.every((res) => res);
	} else {
		// check, wether the object and the template are of the same type
		if (typeof obj !== typeof template) {
			return false;
		} else {
			return true;
		}
	}
}

export enum HTTPStatus {
	Continue = 100,
	SwitchingProtocols = 101,
	EarlyHints = 103,
	OK = 200,
	Created = 201,
	Accepted = 202,
	NonauthoritativeInformation = 203,
	NoContent = 204,
	ResetContent = 205,
	PartialContent = 206,
	MultipleChoices = 300,
	MovedPermanently = 301,
	Found = 302,
	SeeOther = 303,
	NotModified = 304,
	unused = 306,
	TemporaryRedirect = 307,
	Permanent = 308,
	BadRequest = 400,
	Unauthorized = 401,
	Forbidden = 403,
	NotFound = 404,
	MethodNotAllowed = 405,
	NotAcceptable = 406,
	ProxyAuthenticationRequired = 407,
	RequestTimeout = 408,
	Conflict = 409,
	Gone = 410,
	LengthRequired = 411,
	PreconditionFailed = 412,
	PayloadTooLarge = 413,
	URITooLong = 414,
	UnsupportedMediaType = 415,
	RangeNotSatisfiable = 416,
	ExpectationFailed = 417,
	Imateapot = 418,
	MisdirectedRequest = 421,
	TooEarly = 425,
	UpgradeRequired = 426,
	PreconditionRequired = 428,
	TooManyRequests = 429,
	RequestHeaderFieldsTooLarge = 431,
	UnavailableForLegalReasons = 451,
	InternalServerError = 500,
	NotImplemented = 501,
	BadGateway = 502,
	ServiceUnavailable = 503,
	GatewayTimeout = 504,
	HTTPVersionNotSupported = 505,
	VariantAlsoNegotiates = 506,
	NotExtended = 510,
	NetworkAuthenticationRequired = 511	
}

const Config = new ConfigClass();
export default Config;