FROM node:22-alpine

WORKDIR /app
COPY docs /app/docs
COPY server /app/server

ENV PORT=8099
ENV NODE_ENV=production
ENV DOCS_DIR=/app/docs

EXPOSE 8099

USER node
CMD ["node", "/app/server/server.mjs"]
