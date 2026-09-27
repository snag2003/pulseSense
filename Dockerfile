FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev
FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package*.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node sql ./sql
COPY --chown=node:node deploy ./deploy
COPY --chown=node:node vision ./vision
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libgl1 libglib2.0-0 ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv vision/.venv && vision/.venv/bin/python -m pip install --no-cache-dir -r vision/requirements.txt && vision/.venv/bin/python vision/setup.py && mkdir -p vision/.cache && chown -R node:node vision/.cache
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/index.mjs"]
