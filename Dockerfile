FROM oven/bun:latest

WORKDIR /app

COPY package.json .
COPY bun.lock .
RUN bun install

COPY . .

RUN chmod +x docker-entrypoint.sh

ENTRYPOINT [ "./docker-entrypoint.sh" ]