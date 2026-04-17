# Playground Deployment

This directory contains minimal deployment assets for exposing only the playground to
the public internet.

Topology:

- Public internet -> `nginx` -> `apps/web`
- `apps/web` -> `chem-service` over a trusted internal boundary
- `chem-service` is not exposed directly

It now includes two deployment styles:

- `systemd` + `nginx`
- `compose` + reverse proxy

Suggested server layout:

```text
/srv/chemd
/etc/chemd/playground/web.env
/etc/chemd/playground/chem-service.env
/etc/systemd/system/chemd-playground-web.service
/etc/systemd/system/chemd-playground-chem.service
/etc/nginx/sites-available/chemd-playground.conf
```

## Compose

Files:

- `compose.yaml`
- `.env.example`
- `web.Dockerfile`
- `chem-service.Dockerfile`

Typical compose flow:

```bash
cd /srv/chemd/deploy/playground
cp .env.example .env
```

Then:

1. Edit `.env`
2. Start the stack with `docker compose up -d`
3. Create a reverse proxy to `http://127.0.0.1:${PUBLIC_WEB_PORT}`

Important notes for the compose stack:

- Keep `compose.yaml` inside this repository path when importing it. If you move the
  compose file elsewhere, update the `build.context` values.
- `web` is published to `127.0.0.1:${PUBLIC_WEB_PORT}`
- `chem-service` is not published to the host
- `apps/web` calls `chem-service` through the Docker network
- container-to-container auth is enforced through `CHEM_SERVICE_ACCESS_KEY`
- you do not need to put the final public domain into `.env` just to expose the playground;
  a reverse proxy to `127.0.0.1:${PUBLIC_WEB_PORT}` is enough

## systemd / nginx

Prepare the app before enabling the services:

```bash
git clone <repo-url> /srv/chemd
cd /srv/chemd
pnpm install
pnpm build

cd /srv/chemd/services/chem-service
poetry install --only main
```

Copy the example env files:

```bash
sudo mkdir -p /etc/chemd/playground
sudo cp /srv/chemd/deploy/playground/env/web.env.example /etc/chemd/playground/web.env
sudo cp /srv/chemd/deploy/playground/env/chem-service.env.example /etc/chemd/playground/chem-service.env
```

Install the service files:

```bash
sudo cp /srv/chemd/deploy/playground/systemd/chemd-playground-web.service /etc/systemd/system/
sudo cp /srv/chemd/deploy/playground/systemd/chemd-playground-chem.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now chemd-playground-chem chemd-playground-web
```

Install the nginx site:

```bash
sudo cp /srv/chemd/deploy/playground/nginx/chemd-playground.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/chemd-playground.conf /etc/nginx/sites-enabled/chemd-playground.conf
sudo nginx -t
sudo systemctl reload nginx
```

Health checks:

```bash
curl http://127.0.0.1:18081/healthz
curl -I http://127.0.0.1:2436
```

General notes:

- Replace `User=chemd` and `Group=chemd` if you use a different deploy user.
- If `chem-service` stays on the same host and loopback only, `CHEM_SERVICE_ACCESS_KEY`
  can remain unset.
- If you later split `apps/web` and `chem-service` onto different hosts, set the same
  `CHEM_SERVICE_ACCESS_KEY` in both env files.
