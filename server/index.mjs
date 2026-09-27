import { projectRoot, printConfiguration } from './config.mjs';
import { createApp } from './app.mjs';
process.chdir(projectRoot);
printConfiguration();
const { app } = createApp();
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, process.env.HOST || '127.0.0.1', () => {
  console.log(`PulseSense ready at http://${process.env.HOST || '127.0.0.1'}:${port}`);
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Another PulseSense copy may be running with different API settings. Stop that copy before starting this one.`);
  } else console.error(`Server could not start (${error.code || 'unknown error'}).`);
  process.exitCode = 1;
});
