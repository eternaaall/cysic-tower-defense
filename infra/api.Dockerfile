FROM node:20-slim
WORKDIR /app
COPY apps/api/package.json apps/api/tsconfig.json ./
RUN npm install --production=false && npm cache clean --force
COPY apps/api ./
RUN npm run build
ENV NODE_ENV=production
CMD ["node","dist/index.cjs"]
