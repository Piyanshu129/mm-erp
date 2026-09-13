import { app } from "./app";
import { env } from "./config/env";
import { startExcelExportScheduler } from "./lib/excelExportScheduler";

app.listen(env.PORT, () => {
  console.log(`MM ERP backend listening on http://localhost:${env.PORT}`);
});

startExcelExportScheduler();
