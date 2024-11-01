package main

import (
	"bytes"
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

var CONFIG_PATH = "../backend/config.yaml"

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

var Config ConfigYaml

func loadConfig() ConfigYaml {
	config := ConfigYaml{}

	yamlFile, err := os.ReadFile(CONFIG_PATH)
	if err != nil {
		panic(fmt.Sprintf("Error opening config-file: %v", err))
	}

	reader := bytes.NewReader(yamlFile)

	dec := yaml.NewDecoder(reader)
	dec.KnownFields(true)

	if err := dec.Decode(&config); err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing config-file: %v", err.Error())
		os.Exit(1)
	}

	return config
}

func writeConfig() {
	buf := bytes.Buffer{}
	enc := yaml.NewEncoder(&buf)
	enc.SetIndent(2)
	// Can set default indent here on the encoder
	if err := enc.Encode(&Config); err != nil {
		panic(err)
	} else {
		if err := os.WriteFile(CONFIG_PATH, buf.Bytes(), 0644); err != nil {
			panic(err)
		}
	}
}

func init() {
	Config = loadConfig()
}
