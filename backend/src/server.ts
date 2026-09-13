import { app } from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.log(`MM ERP backend listening on http://localhost:${env.PORT}`);
});
