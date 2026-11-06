FROM node:20-slim

WORKDIR /app

COPY package.json package.json
COPY bun.lock* ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 7860

ENV PORT=7860
CMD ["npm", "run", "dev"]
