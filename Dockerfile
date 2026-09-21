FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /var/data && chown node:node /var/data
ENV NODE_ENV=production
ENV PORT=8060
ENV KULT_DATA_FILE=/var/data/kult-world.json
EXPOSE 8060
USER node
HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8060/api/health >/dev/null || exit 1
CMD ["npm", "start"]
