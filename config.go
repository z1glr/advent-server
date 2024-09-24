package main

import (
	"bytes"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"gopkg.in/yaml.v3"
)

type ConfigYaml struct {
	LogLevel string `yaml:"log_level"`
	Database struct {
		Host            string `yaml:"host"`
		User            string `yaml:"user"`
		Password        string `yaml:"password"`
		Database        string `yaml:"database"`
		ConnectionLimit int    `yaml:"connection_limit"`
	} `yaml:"database"`
	ClientSession struct {
		JwtSignature string `yaml:"jwt_signature"`
		Expire       string `yaml:"expire"`
	} `yaml:"client_session"`
	Setup struct {
		Days  int8   `yaml:"days"`
		Start string `yaml:"start"`
	} `yaml:"setup"`
	Server struct {
		Port      int    `yaml:"port"`
		UploadDir string `yaml:"upload_dir"`
	} `yaml:"server"`
}

type ConfigStruct struct {
	ConfigYaml
	SessionExpire time.Duration
}

var Config ConfigStruct

type Payload struct {
	jwt.RegisteredClaims
	CustomClaims map[string]any
}

func (config ConfigStruct) signJWT(val any) (string, error) {
	valMap, err := strucToMap(val)

	if err != nil {
		return "", err
	}

	payload := Payload{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(Config.SessionExpire)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
		CustomClaims: valMap,
	}

	t := jwt.NewWithClaims(jwt.SigningMethodHS256, payload)

	return t.SignedString([]byte(Config.ClientSession.JwtSignature))
}

func loadConfig() ConfigStruct {
	config := ConfigYaml{}

	yamlFile, err := os.ReadFile("config.yaml")
	if err != nil {
		logger.Sugar().Errorf("Error opening config-file: %q", err)
	}

	reader := bytes.NewReader(yamlFile)

	dec := yaml.NewDecoder(reader)
	dec.KnownFields(true)
	err = dec.Decode(&config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing config-file: %q", err.Error())
		os.Exit(1)
	}

	duration, err := time.ParseDuration(config.ClientSession.Expire)

	if err != nil {
		fmt.Fprintf(os.Stderr, `Error Parsing "client_session.expire": %q`, err.Error())
		os.Exit(1)
	}

	return ConfigStruct{
		ConfigYaml:    config,
		SessionExpire: duration,
	}
}

func init() {
	Config = loadConfig()
}
