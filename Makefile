.PHONY: all backend setup init client

all: backend client

backend:
	@echo "building server"
	cd backend; go build -ldflags "-s -w"

client/node_modules:
	@echo "installing client-packages"
	cd client; npm install

client: client/node_modules
	@echo "building client"
	cd client; npm run release

init:
	@echo "creating \"backend/config.yaml\""
	@cp -n backend/example_config.yaml backend/config.yaml

setup:
	@echo "running setup"
	cd setup; go run .
