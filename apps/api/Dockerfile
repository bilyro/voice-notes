# apps/api/Dockerfile — one image for both API and worker
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo build --filter=@vn/api...
# rootDir "." → dist/src/. Keep comments off the CMD line: a trailing comment turns the JSON form into shell form
CMD ["node", "apps/api/dist/src/server.js"]
