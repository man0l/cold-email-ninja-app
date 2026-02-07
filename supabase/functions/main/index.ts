// @ts-ignore
import { STATUS_CODE } from "https://deno.land/std/http/status.ts";

import { join } from "jsr:@std/path@^1.0";
import { context, propagation } from "npm:@opentelemetry/api";
import { W3CBaggagePropagator } from "npm:@opentelemetry/core@1";

// @ts-ignore See https://github.com/denoland/deno/issues/28082
if (globalThis[Symbol.for("opentelemetry.js.api.1")]) {
  globalThis[Symbol.for("opentelemetry.js.api.1")].propagation =
    new W3CBaggagePropagator();
}

console.log("main function started");
console.log(Deno.version);

addEventListener("beforeunload", () => {
  console.log("main worker exiting");
});

addEventListener("unhandledrejection", (ev) => {
  console.log(ev);
  ev.preventDefault();
});

Deno.serve(async (req: Request) => {
  const ctx = propagation.extract(context.active(), req.headers, {
    get(carrier, key) {
      return carrier.get(key) ?? void 0;
    },
    keys(carrier) {
      return [...carrier.keys()];
    },
  });
  const baggage = propagation.getBaggage(ctx);
  const requestId = baggage?.getEntry("sb-request-id")?.value ?? null;

  const headers = new Headers({
    "Content-Type": "application/json",
  });

  const url = new URL(req.url);
  const { pathname } = url;

  // handle health checks
  if (pathname === "/_internal/health") {
    return new Response(
      JSON.stringify({ "message": "ok" }),
      {
        status: STATUS_CODE.OK,
        headers,
      },
    );
  }

  if (pathname === "/_internal/metric") {
    const metric = await EdgeRuntime.getRuntimeMetrics();
    return Response.json(metric);
  }

  if (req.method === "PUT" && pathname === "/_internal/upload") {
    try {
      const content = await req.text();
      const dir = await Deno.makeTempDir();
      const path = join(dir, "index.ts");

      await Deno.writeTextFile(path, content);
      return Response.json({
        path: dir,
      });
    } catch (err) {
      return Response.json(err, {
        status: STATUS_CODE.BadRequest,
      });
    }
  }

  let servicePath = pathname;
  if (!pathname.startsWith("/tmp/")) {
    const pathParts = pathname.split("/");
    const serviceName = pathParts[1];

    if (!serviceName || serviceName === "") {
      const error = { msg: "missing function name in request" };
      return new Response(
        JSON.stringify(error),
        {
          status: STATUS_CODE.BadRequest,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Functions are mounted at /home/deno/functions/<name>
    servicePath = `/home/deno/functions/${serviceName}`;
  } else {
    try {
      servicePath = await Deno.realPath(servicePath);
    } catch (err) {
      return Response.json(err, {
        status: STATUS_CODE.BadRequest,
      });
    }
  }

  const createWorker = async (otelAttributes?: { [_: string]: string }) => {
    const memoryLimitMb = 150;
    const workerTimeoutMs = 5 * 60 * 1000;
    const noModuleCache = false;

    const envVarsObj = Deno.env.toObject();
    const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);
    const forceCreate = false;

    const cpuTimeSoftLimitMs = 10000;
    const cpuTimeHardLimitMs = 20000;
    const staticPatterns = [
      "/home/deno/functions/**/*.html",
    ];

    return await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb,
      workerTimeoutMs,
      noModuleCache,
      envVars,
      forceCreate,
      cpuTimeSoftLimitMs,
      cpuTimeHardLimitMs,
      staticPatterns,
      context: {
        useReadSyncFileAPI: true,
        otel: otelAttributes,
      },
      otelConfig: {
        tracing_enabled: true,
        propagators: ["TraceContext", "Baggage"],
      },
    });
  };

  const callWorker = async () => {
    try {
      const worker = await createWorker(
        requestId
          ? {
            "sb_request_id": requestId,
          }
          : void 0,
      );

      const controller = new AbortController();

      const signal = controller.signal;
      return await worker.fetch(req, { signal });
    } catch (e) {
      console.log("hit", e);
      if (e instanceof Deno.errors.WorkerAlreadyRetired) {
        return await callWorker();
      }
      if (e instanceof Deno.errors.WorkerRequestCancelled) {
        headers.append("Connection", "close");
      }

      const error = { msg: e.toString() };
      return new Response(
        JSON.stringify(error),
        {
          status: STATUS_CODE.InternalServerError,
          headers,
        },
      );
    }
  };

  return callWorker();
});
