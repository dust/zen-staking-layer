# ltZEN unified stack — run from this directory: `cd deploy && make <target>`
#
# Common:
#   make env          copy .env.example → .env (if missing)
#   make build        build frontend image
#   make up           start stack
#   make release      build + force-recreate (typical deploy)
#   make force-recreate  recreate containers (optionally with build)
#   make down         stop & remove containers
#   make logs         follow logs
#   make gen-api-key  print a new rrelayer API key

COMPOSE ?= docker compose
COMPOSE_FILE ?= docker-compose.yml
export COMPOSE_FILE

.PHONY: help env build pull up down restart release force-recreate \
	ps logs logs-frontend logs-rrelayer gen-api-key shell-frontend shell-rrelayer

help:
	@echo "ltZEN deploy targets:"
	@echo "  make env             Create .env from .env.example if missing"
	@echo "  make build           Build frontend + gas-provider images"
	@echo "  make pull            Pull postgres/rrelayer images"
	@echo "  make up              Start stack (detached)"
	@echo "  make release         build + up --force-recreate (ship a release)"
	@echo "  make force-recreate  Recreate all services (BUILD=1 to rebuild)"
	@echo "  make down            Stop and remove containers"
	@echo "  make restart         Restart all services"
	@echo "  make ps / logs       Status / follow logs"
	@echo "  make gen-api-key     rrelayer auth gen-api-key (docker)"

env:
	@test -f .env || (cp .env.example .env && echo "Created .env — edit secrets before up")
	@test -f .env && echo ".env ready"

build:
	$(COMPOSE) build frontend gas-stub

pull:
	$(COMPOSE) pull postgresql rrelayer

up: env
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

# Typical production ship: rebuild frontend + gas-provider, recreate everything.
release: env build
	$(COMPOSE) up -d --force-recreate --remove-orphans
	@$(COMPOSE) ps

# Recreate without necessarily rebuilding. Use: make force-recreate BUILD=1
force-recreate: env
ifeq ($(BUILD),1)
	$(COMPOSE) up -d --build --force-recreate --remove-orphans
else
	$(COMPOSE) up -d --force-recreate --remove-orphans
endif
	@$(COMPOSE) ps

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f --tail=200

logs-frontend:
	$(COMPOSE) logs -f --tail=200 frontend

logs-rrelayer:
	$(COMPOSE) logs -f --tail=200 rrelayer

gen-api-key:
	@docker run --rm -v "$(CURDIR)/rrelayer:/app/project" ghcr.io/joshstevens19/rrelayer \
		auth gen-api-key -p /app/project

shell-frontend:
	$(COMPOSE) exec frontend sh

shell-rrelayer:
	$(COMPOSE) exec rrelayer sh
