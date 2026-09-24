# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY register-paths.js ./

ARG APP=gateway
ENV APP=${APP}

EXPOSE 3000

# CMD (not ENTRYPOINT) so compose can override it (e.g. run migrations first).
CMD ["sh", "-c", "node -r ./register-paths.js dist/apps/$APP/main.js"]