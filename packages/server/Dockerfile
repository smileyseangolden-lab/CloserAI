FROM node:20-alpine AS base
WORKDIR /app

# Copy workspace root manifest
COPY package.json ./
COPY packages/server/package.json ./packages/server/

# Install deps (workspace-aware)
RUN npm install --workspace @closerai/server --include-workspace-root

# Copy source
COPY packages/server ./packages/server

WORKDIR /app/packages/server

# Build TypeScript
RUN npm run build || echo "Build step optional in dev"

EXPOSE 4000

CMD ["npm", "run", "dev"]
