export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname + getRequestURL(event).search;
  return proxyRequest(
    event,
    (process.env.API_ORIGIN || "http://api:3001") + path,
  );
});
