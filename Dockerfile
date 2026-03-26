FROM node:20-alpine AS base
RUN apk add --no-cache openssl

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
RUN npm remove @shopify/cli

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
EXPOSE 3000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json ./
COPY prisma ./prisma

CMD ["npm", "run", "docker-start"]
