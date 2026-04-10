FROM node:20-alpine AS base
WORKDIR /app

COPY package.json ./
COPY packages/client/package.json ./packages/client/

RUN npm install --workspace @closerai/client --include-workspace-root

COPY packages/client ./packages/client

WORKDIR /app/packages/client

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
