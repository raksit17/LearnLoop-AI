FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
CMD ["node",".output/server/index.mjs"]
