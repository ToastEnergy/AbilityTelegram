FROM node:24-alpine3.21

RUN apk add --no-cache \
    bash \
    curl

RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

WORKDIR /app

COPY package.json .
COPY bun.lock .
RUN bun install

COPY . .

RUN chmod +x docker-entrypoint.sh

ENTRYPOINT [ "./docker-entrypoint.sh" ]