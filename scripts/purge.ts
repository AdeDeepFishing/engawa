import { runPurge } from "../lib/db/purge";

runPurge()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.errors.length ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
