FROM node:22-alpine

RUN apk add --no-cache bash
RUN npm install -g pnpm@11.1.2

WORKDIR /app

# Copy the whole repo (build context provided by docker-compose)
COPY . .

# Install dependencies (uses workspace install)
RUN rm -rf node_modules && CI=true pnpm install --frozen-lockfile
RUN pnpm --filter backend exec prisma generate

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["pnpm", "--filter", "backend", "dev"]
