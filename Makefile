.PHONY: all backend setup init client

all: backend client

out_dir = dist

backend:
	@echo "building server"
	cd backend; go build -ldflags "-s -w" -o ../$(out_dir)/backend/
	@echo "copying config.yaml"
	cp backend/config.yaml dist/backend
	@echo "creating upload-directory for file-upload"
	mkdir dist/backend/uploads -p

client/node_modules:
	@echo "installing client-packages"
	cd client; npm install

client: client/node_modules
	@echo "building client"
	cd client; npm run build

init:
	@echo "creating \"backend/config.yaml\""
	@cp -n backend/example_config.yaml backend/config.yaml

setup:
	@echo "running setup"
	cd setup; go run .
