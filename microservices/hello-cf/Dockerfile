# 不依賴 Cloudflare 的執行方式：docker build -t townpass-hello . && docker run -p 8080:8080 townpass-hello
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY public ./public
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/node.js"]
