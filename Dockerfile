FROM oven/bun:latest

COPY package.json ./
COPY bun.lock ./
COPY src ./
COPY docker-entrypoint.sh ./

RUN bun install
ENTRYPOINT [ "./docker-entrypoint.sh" ]