.PHONY: help build claude agy openspec shell test

help:
	@./scripts/sandbox.sh help

build:
	@./scripts/sandbox.sh build

claude:
	@./scripts/sandbox.sh claude

agy:
	@./scripts/sandbox.sh agy

openspec:
	@./scripts/sandbox.sh openspec $(ARGS)

shell:
	@./scripts/sandbox.sh shell

test:
	@./scripts/sandbox.sh run npm test
