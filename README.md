# Translator

Mini Persian and English translator powered by Cerebras Cloud.

## Run

```bash
npm install
npm start
```

Default address:

```text
http://0.0.0.0:8080
```

From another device, open:

```text
http://YOUR_PUBLIC_IP:8080
```

Open the port in your firewall or cloud security group if the public IP cannot reach it.

## Config

Runtime values live in `.env`.

```text
CEREBRAS_API_KEY=your-cerebras-api-key
CEREBRAS_MODEL=gemma-4-31b
CEREBRAS_BASE_URL=https://api.cerebras.ai/v1
HOST=0.0.0.0
PORT=8080
MAX_TEXT_LENGTH=8000
```

The browser calls only the local `/api/translate` endpoint. The Cerebras API key stays on the server.
