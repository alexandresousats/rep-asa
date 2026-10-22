export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const upstream = await fetch("http://127.0.0.1:4000/ai/chat", {
    method: "POST",
    headers: {
      cookie: request.headers.get("cookie") ?? "",
      "content-type": "application/json",
    },
    body: await request.text(),
    cache: "no-store",
    signal: request.signal,
  });
  if (!upstream.ok || !upstream.body) {
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
