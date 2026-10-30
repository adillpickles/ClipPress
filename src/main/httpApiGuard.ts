// The HTTP API (--http-api) is for local programs. A web page open in the user's browser can also reach a loopback
// port, so a request is refused when it came from a page: browsers send an Origin with every cross-site POST, can't
// send a JSON body to another site without a CORS preflight (which the server never answers), and a DNS name rebound
// to 127.0.0.1 still shows up as itself in Host.
export default function isLocalApiRequest({ hostname, origin, isJson }: { hostname: string | undefined, origin: string | undefined, isJson: boolean }) {
  return (hostname === '127.0.0.1' || hostname === 'localhost') && origin == null && isJson;
}
