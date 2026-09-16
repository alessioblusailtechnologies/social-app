# Il servizio di render di Presenza. Si costruisce dalla radice del repo, perché il sito Remotion
# include src/templates e src/domain dell'app:
#
#   docker build -f be-render/Dockerfile -t presenza-render .
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

COPY be-render/package.json be-render/package-lock.json be-render/
RUN cd be-render && npm ci --include=dev

# Il codice dell'app che finisce nel sito: dominio, template e i token che il catalogo importa.
COPY src/domain src/domain
COPY src/lib src/lib
COPY src/templates src/templates
COPY src/design-system/tokens.ts src/design-system/tokens.ts
COPY be-render be-render

# Browser, server e sito si preparano qui: all'avvio il servizio è pronto in pochi secondi.
RUN cd be-render \
  && node -e "import('@remotion/renderer').then((renderer) => renderer.ensureBrowser())" \
  && npm run build \
  && npm run bundle-site

ENV NODE_ENV=production
ENV RENDER_SERVE_URL=/app/be-render/build/site
EXPOSE 3020
CMD ["node", "be-render/dist/server.mjs"]
