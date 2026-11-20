# Web de FitoLens: compila React y lo sirve con nginx en el puerto 80 interno.
# Caddy (despliegue/) pone HTTPS delante y envía /api a la API.
FROM node:22-alpine AS compilar
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# false = si la API falla se muestra el error (nunca datos simulados). Lo pasa docker-compose.yml.
ARG VITE_MODO_DEMO=false
ENV VITE_MODO_DEMO=$VITE_MODO_DEMO
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=compilar /web/dist /usr/share/nginx/html
EXPOSE 80
