# Production deployment

This is a baseline Linux deployment. Adapt paths, users, firewall rules, retention, and reverse-proxy configuration to your environment.

## 1. Install prerequisites

- Node.js 22.13+
- npm
- Python 3 with `venv`
- FFmpeg/FFprobe
- Git
- A TLS-capable reverse proxy such as Nginx or Caddy

```bash
sudo apt update
sudo apt install -y git ffmpeg python3 python3-venv
git clone https://github.com/Kusarok/translator.git /opt/translator
cd /opt/translator
npm ci --omit=dev
npm run media:install
cp .env.example .env
```

The included systemd examples use `/root/github/translator`. Replace every `WorkingDirectory`, `EnvironmentFile`, and path with the actual deployment directory before installing them. Prefer a dedicated unprivileged service user.

## 2. Configure private environment

At minimum, review:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=8080
TRUST_PROXY=1
APP_DATA_DIR=/opt/translator/data
MEDIA_WORKER_URL=http://127.0.0.1:8090
RADIO_WORKER_URL=http://127.0.0.1:8091
OWNER_USERNAME=
OWNER_PASSWORD=
```

Add only the provider and OAuth credentials your deployment uses. Set file permissions so only the service account can read `.env` and `.env.radio`:

```bash
chmod 600 .env .env.radio 2>/dev/null || true
```

## 3. Google and Spotify OAuth

Use exact HTTPS callbacks:

```text
https://your-domain.example/api/auth/google/callback
https://your-domain.example/api/media/spotify/callback
```

Configure the same values in the provider console and environment. Never reuse test secrets in production.

## 4. systemd

After adapting the unit paths:

```bash
sudo cp deploy/systemd/translator.target /etc/systemd/system/
sudo cp deploy/systemd/translator-web.service /etc/systemd/system/
sudo cp deploy/systemd/media-worker.service /etc/systemd/system/
sudo cp deploy/systemd/radio-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now translator.target
systemctl status translator.target translator-web media-worker radio-worker
```

The example media worker uses the host network. A VPN/network namespace is an operator-specific customization and should not be copied blindly.

## 5. Reverse proxy

Proxy only the main web port. Support WebSocket upgrades for live voice. A minimal Nginx location is:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
}
```

Use your proxy's recommended WebSocket mapping and TLS configuration. Do not expose ports 8090 or 8091 publicly.

## 6. Backups and upgrades

Back up `.env` and the complete data directory separately from the Git checkout. SQLite WAL mode requires a consistent backup of the database and its `-wal`/`-shm` files, or a SQLite backup operation while services are running.

```bash
sudo systemctl stop translator.target
git pull --ff-only
npm ci --omit=dev
npm run media:install
npm test
sudo systemctl start translator.target
```

Review migrations and release notes before every upgrade. Test restoration, not only backup creation.
