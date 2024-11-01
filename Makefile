.PHONY: all backend setup init

all: backend

backend:
	@echo "building server"
	cd backend; go build -ldflags "-s -w"

init:
	@echo "creating \"backend/config.yaml\""
	@cp -n backend/example_config.yaml backend/config.yaml

setup:
	@echo "running setup"
	cd setup; go run .
