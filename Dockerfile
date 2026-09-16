# Starts the stdio bridge for MCP directories that build and introspect a server.
# Inside a container there is no Scalebrowser app, so the bridge answers with the
# tool list and install instructions. With the app on the same Windows machine,
# run the bridge with Node instead (see README).
FROM node:24.21.0-alpine@sha256:be80f76cf40ec8e42b9bec49f60a55e0660f30af58d3e5a25530785b30ea67e2
WORKDIR /app
COPY package.json ./
COPY bridge/scalebrowser-mcp.mjs bridge/tools.json ./bridge/
USER node
ENTRYPOINT ["node", "bridge/scalebrowser-mcp.mjs"]
