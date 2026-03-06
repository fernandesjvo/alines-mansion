FROM node:20-slim

# Instala dependências do sistema para Playwright/Chromium
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia package files e instala dependências
COPY package.json package-lock.json ./
RUN npm ci --production

# Instala Chromium para Playwright
RUN npx playwright install chromium

# Copia código fonte
COPY src/ ./src/
COPY tsconfig.json ./

# Build TypeScript
RUN npx tsc

# Porta do servidor
ENV PORT=3001
EXPOSE 3001

# Inicia o servidor
CMD ["node", "dist/index.js"]
