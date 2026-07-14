import test from "node:test";
import assert from "node:assert/strict";
import { handleRequest } from "../worker.js";

test("the Worker serves the homepage when the root asset route falls through", async () => {
  const requestedPaths = [];
  const env = {
    ASSETS: {
      fetch(request) {
        requestedPaths.push(new URL(request.url).pathname);
        return Promise.resolve(new Response("homepage", { status: 200 }));
      }
    }
  };

  const response = await handleRequest(new Request("https://example.test/"), env);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "homepage");
  assert.deepEqual(requestedPaths, ["/index.html"]);
});
