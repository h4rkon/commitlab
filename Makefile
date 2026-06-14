.PHONY: run install dev build preview clean desktop-dev desktop-build test-e2e

run: install dev

install:
	npm install

dev:
	npm run dev

build:
	npm run build

preview:
	npm run preview

clean:
	rm -rf dist node_modules

desktop-dev:
	@echo "desktop-dev is not available yet. Add a desktop npm script before enabling this target."

desktop-build:
	@echo "desktop-build is not available yet. Add a desktop npm script before enabling this target."

test-e2e:
	@echo "test-e2e is not available yet. Add an e2e npm script before enabling this target."
