# Ticket Hygiene Dashboard — Node/Express, no build step (plain JS, no bundler).
FROM node:20-alpine

WORKDIR /app

# Install dependencies first so this layer is cached across code-only changes.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

# All persistent state (NTA credentials, synced-ticket cache, Excel upload) lives under
# data/ — mount this as a volume so it survives container recreation/redeploys.
RUN mkdir -p /app/data \
  && addgroup -S app && adduser -S app -G app \
  && chown -R app:app /app
VOLUME ["/app/data"]
USER app

ENV PORT=6100
EXPOSE 6100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 6100) + '/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
