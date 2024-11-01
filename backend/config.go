package main

import (
	"bytes"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"strings"
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
	UploadDirSys  fs.FS
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

func (config ConfigStruct) sanitizeUploadDir(pth string) (string, error) {
	pth = path.Join(config.Server.UploadDir, pth)

	// replace the home-directorz
	if strings.HasPrefix(pth, "~") {
		if home, err := os.UserHomeDir(); err != nil {
			return "", err
		} else {
			pth = path.Join(home, pth[1:])
		}
	}

	// expand environment variables
	pth = os.ExpandEnv(pth)
	pth = path.Clean(pth)

	// evaluate symlinks
	if relPath, err := filepath.Rel(config.Server.UploadDir, pth); err != nil {
		return "", err
	} else if relPath == "." || !strings.HasPrefix(relPath, "..") {
		return relPath, nil
	} else {
		return "", fmt.Errorf("path %q is not inside of %q", pth, config.Server.UploadDir)
	}
}

func (config ConfigStruct) getUploadDir(pth string) (string, error) {
	if pth, err := config.sanitizeUploadDir(pth); err != nil {
		return pth, err
	} else {
		return path.Join(Config.Server.UploadDir, pth), nil
	}
}

func loadConfig() ConfigStruct {
	config := ConfigYaml{}

	yamlFile, err := os.ReadFile("config.yaml")
	if err != nil {
		logger.Sugar().Errorf("Error opening config-file: %v", err)
	}

	reader := bytes.NewReader(yamlFile)

	dec := yaml.NewDecoder(reader)
	dec.KnownFields(true)
	err = dec.Decode(&config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing config-file: %v", err.Error())
		os.Exit(1)
	}

	duration, err := time.ParseDuration(config.ClientSession.Expire)

	if err != nil {
		fmt.Fprintf(os.Stderr, `Error Parsing "client_session.expire": %v`, err.Error())
		os.Exit(1)
	}

	return ConfigStruct{
		ConfigYaml:    config,
		SessionExpire: duration,
		UploadDirSys:  os.DirFS(config.Server.UploadDir),
	}
}

func init() {
	Config = loadConfig()
}
