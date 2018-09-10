import * as connect from 'connect';
import * as harmon from 'harmon';
import * as http from 'http';
import * as httpProxy from 'http-proxy';

// --- Define selectors and modifiers for harmon

const selectors = [
  {
    // Add <base> tag in <head> to ensure that all
    // subsequent relative requests are sent directly
    // to the target host without further proxying.
    query: 'head',
    func: appendToNode((content, req) => {
      const host = extractTarget(req, true);
      if (host && !/<base\b/.test(content)) {
        return `<base href="${host}"/>`;
      }
    })
  },
  {
    // Add script
    query: 'body',
    func: appendToNode(() => {
      // TODO: Determine blinx options from query parameters; if no language given, check html doc
      const language = 'en';
      return `
      <script
        src="https://cdn.rawgit.com/renehamburger/Bible-Passage-Reference-Parser/99f03385/js/${language}_bcv_parser.js"
        defer
        data-blinx="{
          language: '${language}',
          theme: 'dark'
        }">
      </script>
      <script
        src="https://cdn.rawgit.com/renehamburger/blinx.js/v0.3.7/dist/blinx.js"
        defer>
      </script>
    `;
    })
  }
];

//--- Create proxy; target URL will be assigned below

const proxy = httpProxy.createProxyServer({
  changeOrigin: true
});

proxy.on('error', (e) => {
  console.error(e);
});

//--- Create & start app

const app = connect();

app.use(harmon([], selectors));

app.use((req: http.IncomingMessage, res: http.ServerResponse) => {
  const target = extractTarget(req);
  if (target) {
    // Remove 'accept-encoding' to disable gzip compression
    // See https://github.com/nodejitsu/node-http-proxy/issues/795#issuecomment-84109473
    delete req.headers['accept-encoding'];
    proxy.web(req, res, { target });
  }
});

http.createServer(app).listen(80);

//--- Helpers

function extractTarget(req: http.IncomingMessage, onlyRoot = false) {
  const query = (req as any)._parsedUrl.query || '';
  const urlMatches = query.match(/(?:^|&)url=(.*?)(?:$|&)/i);
  let target = urlMatches ? urlMatches[1] : '';
  if (!target) {
    console.error(`'url' query parameter missing in request:`, (req as any)._parsedUrl);
  }
  if (!/^https?:/.test(target)) {
    target = 'http://' + target;
  }
  if (onlyRoot) {
    const rootMatches = target.match(/(^https?:\/\/[^\/]+)\//);
    return rootMatches ? rootMatches[1] : target;
  }
  return target;
}

function appendToNode(appendCallback: (content: string, req: http.IncomingMessage) => void) {
  return (node: harmon.Node, req: http.IncomingMessage) => {
    const rs = node.createReadStream();
    const ws = node.createWriteStream({ outer: false });

    // Read the node and put it back into our write stream,
    // but don't end the write stream when the readStream is closed.
    rs.pipe(ws, { end: false });

    let content = '';
    rs.on('data', (data: string) => {
      content += data;
    });

    // When the read stream has ended, attach our style to the end
    rs.on('end', () => {
      const appendix = appendCallback(content, req);
      if (appendix) {
        ws.end(appendix);
      }
    });
  };
}
