import * as http from 'http';
import * as httpProxy from 'http-proxy';
import * as connect from 'connect';
import * as harmon from 'harmon';

//--- Define selectors and modifiers for harmon

const selectors = [
  {
    // Add <base> tag in <head> to ensure that all
    // subsequent relative requests are sent directly
    // to the target host without further proxying.
    query: 'head',
    func: appendToNode((content, req) => {
      const host = extractTarget(req, true);
      if (!/<base\b/.test(content)) {
        return `<base href="${host}"/>`;
      }
    })
  },
  {
    // Add script
    query: 'body',
    func: appendToNode(() => '<script>debugger; alert("Script added...!")</script>')
  }
]


//--- Create proxy; target URL will be assigned below

const proxy = httpProxy.createProxyServer({
  changeOrigin: true
})

proxy.on('error', (e) => {
  console.error(e);
});


//--- Create & start app

const app = connect();

app.use(harmon([], selectors));

app.use(function (req: http.IncomingMessage, res: http.ServerResponse) {
  // Remove 'accept-encoding' to disable gzip compression
  // See https://github.com/nodejitsu/node-http-proxy/issues/795#issuecomment-84109473
  delete req.headers['accept-encoding'];
  proxy.web(req, res, { target: extractTarget(req) });
})

http.createServer(app).listen(9000);


//--- Helpers

function extractTarget(req: http.IncomingMessage, onlyRoot = false) {
  const query = req['_parsedUrl'].query || '';
  const urlMatches = query.match(/(?:^|&)url=(.*?)(?:$|&)/i);
  let target = urlMatches ? urlMatches[1] : 'http://example.com';
  if (!/^https?:/.test(target)) {
    target = 'http://' + target;
  }
  if (onlyRoot) {
    const rootMatches = target.match(/(^https?:\/\/[^\/]+)\//);
    return rootMatches ? rootMatches[1] : target;
  }
  return target;
}

function appendToNode(appendCallback) {
  return (node: any, req: http.IncomingMessage) => {
    const rs = node.createReadStream();
    const ws = node.createWriteStream({ outer: false });

    // Read the node and put it back into our write stream,
    // but don't end the write stream when the readStream is closed.
    rs.pipe(ws, { end: false });

    let content = '';
    rs.on('data', function (data) {
      content += data;
    });

    // When the read stream has ended, attach our style to the end
    rs.on('end', () => {
      const appendix = appendCallback(content, req);
      if (appendix) {
        ws.end(appendix);
      }
    });
  }
}
