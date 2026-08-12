FROM node:20-alpine
RUN apk add --no-cache ffmpeg yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 10000
CMD ["npm", "start"]
