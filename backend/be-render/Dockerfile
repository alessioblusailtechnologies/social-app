# Il servizio di render di Presenza. Si costruisce dalla radice del repo, perché il sito Remotion
# include il codice condiviso con l'app (shared/: template e dominio):
#
#   docker build -f backend/be-render/Dockerfile -t presenza-render .
#   docker run -p 3020:3020 -e RENDER_TOKEN=... presenza-render
#
# Dipendenze di sistema di Chrome Headless Shell dalla guida Docker di Remotion; Alpine è sconsigliata.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libgbm-dev \
    libnss3 \
    libpango-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon-dev \
    libxrandr2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/be-render/package.json backend/be-render/package-lock.json backend/be-render/
RUN cd backend/be-render && npm ci --include=dev

# Il codice condiviso con l'app che finisce nel sito: dominio, template e i token che il catalogo importa.
COPY shared shared
COPY backend/be-render backend/be-render

# Browser, server e sito si preparano qui: all'avvio il servizio è pronto in pochi secondi.
# Il controllo dopo la build: un alias `@shared/` rimasto nel bundle farebbe cadere il server all'avvio.
RUN cd backend/be-render \
  && node -e "import('@remotion/renderer').then((renderer) => renderer.ensureBrowser())" \
  && npm run build \
  && ! grep -q '"@shared/' dist/server.mjs \
  && npm run bundle-site

ENV NODE_ENV=production
ENV RENDER_SERVE_URL=/app/backend/be-render/build/site
EXPOSE 3020
CMD ["node", "backend/be-render/dist/server.mjs"]
