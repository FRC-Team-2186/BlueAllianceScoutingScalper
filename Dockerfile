# Render-ready image for FRC Scout (Next.js + ffmpeg + yt-dlp)
FROM node:20-alpine

# System deps for free-tier video frame sampling (no YouTube Data API)
RUN apk add --no-cache ffmpeg yt-dlp python3

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# Application source
COPY . .

# Writable local analysis cache directory
RUN mkdir -p /app/data/cache

# Build Next.js production bundle
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
