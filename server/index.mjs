import { createServer } from "node:http";
import { projectRoot, printConfiguration } from "./config.mjs";
import { createApp } from "./app.mjs";
process.chdir(projectRoot);
printConfiguration();
const { app } = createApp();
const port = Number(process.env.PORT || 3001);
const server = createServer(app);
server.on("error", error => {
  console.error(error.code === "EADDRINUSE" ? `Port ${port} is already in use. Stop the old server with Ctrl+C, then restart this copy.` : `Server startup failed (${error.code || "unknown"}).`);
  process.exitCode = 1;
});
server.listen(port, process.env.HOST || "127.0.0.1", () => console.log(`PulseSense ready on port ${port}`));
