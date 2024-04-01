const express = require("express");
const bodyParser = require("body-parser");
const staticFiles = express.static("static");
const app = express();

const debug = (...args) => {
  if (process.env['DEBUG']?.indexOf('jq-server') >= 0) {
    console.log(...args);
  }
};
(async function () {
  const { execa } = await import("execa");

  app.use(bodyParser.json());

  app.post("/jq", async (req, res) => {
    const query = req.body.query;
    const data = req.body.data;
    const args = ["-r", query];
    try {
      debug({
        args,
        data,
      })
      const { stdout, stderr } = await execa("jq", args, {
        input: data,
        shell: true,
      });
      debug({ stderr, stdout });
      res.send({response: stdout});
    } catch (e){
      debug(e);
      res.send({response: data, hasError});
    }
  });

  app.use(staticFiles);
  const PORT = 1026;
  app.listen(PORT, () => {
    debug(`Static server listening on port ${PORT}`);
  }, PORT);
})();
