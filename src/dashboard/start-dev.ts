import { startServer } from "./server.js";

const port = parseInt(process.env.DASHBOARD_PORT ?? "3000", 10);
const resultsDir = process.env.RESULTS_DIR ?? "./results";

startServer({ port, resultsDir }).then(() => {
  console.log(`[server] Express API running at http://localhost:${port}`);
});
