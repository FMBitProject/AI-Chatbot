# Production image for self-hosting (see docs/self-hosting.md). Built by
# .github/workflows/docker-image.yml, never on the server itself: `next build`
# peaks at 2-3 GB of RAM, which would starve everything else on a small VPS.
#
# Debian slim rather than Alpine: sharp, unpdf and officeparser are exercised
# against glibc on Vercel, and musl is a second platform nobody has tested.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle by `next build`, so
# they must exist at build time; setting them only on the running container
# does nothing. They are public by definition (they ship to every browser), so
# they travel as build args, never secrets. Server-side secrets are NOT passed
# here — they are read at runtime from the container's environment.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_MIDTRANS_CLIENT_KEY
ARG NEXT_PUBLIC_MIDTRANS_ENV
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_META_PIXEL_ID
ARG NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY
ARG NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ARG NEXT_PUBLIC_SUPPORT_WHATSAPP
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone server does not copy public/ or .next/static on its own; it
# serves them only if they are placed beside server.js.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000

# node is PID 1 and receives SIGTERM directly from `docker stop`, so in-flight
# requests and pending after() callbacks get to finish (give the container a
# stop grace period longer than Docker's default 10 s).
CMD ["node", "server.js"]
