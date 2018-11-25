/**
 * TODO:
 * - Add option to Blinx to remove existing Bible links.
 * - Add wrapper page at blinxify.me which allows to: set url, set options, share link, maybe
 *   compare with original file.
 */
import { Options } from 'blinx.js/src/options/options';
import * as connect from 'connect';
import * as harmon from 'harmon';
import * as http from 'http';
import * as httpProxy from 'http-proxy';
import * as _ from 'lodash';
import * as url from 'url';

// --- Define selectors and modifiers for harmon

const selectors = [
  {
    query: 'head',
    func: appendToNode((content, req) => {
      let newContent = content;
      const { targetParam, options } = parseUrl(req);
      const optionsWithDefaults = _.defaults(options, {
        language: 'en',
        theme: 'dark'
      });
      //--- Add <base> tag
      // to ensure that all subsequent relative requests are sent
      // directly to the target host without further proxying.
      const host = extractTarget(targetParam, true);
      if (host && !/<base\b/.test(content)) {
        newContent += `<base href="${host}"/>`;
      }
      //--- Add blinx.js scripts
      const language = optionsWithDefaults.language;
      const optionsString = JSON.stringify(options, null, 2).replace(/"/g, `'`);
      // tslint:disable:max-line-length
      newContent += `
        <script
          src="https://cdn.rawgit.com/renehamburger/Bible-Passage-Reference-Parser/99f03385/js/${language}_bcv_parser.js"
          defer
          data-blinx="${optionsString}">
        </script>
        <script
          src="https://cdn.rawgit.com/renehamburger/blinx.js/v0.3.11/dist/blinx.js"
          defer>
        </script>
      `;
      // tslint:enable:max-line-length
      return newContent;
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

function parseUrl(req: http.IncomingMessage): { targetParam: string, options: Partial<Options> } {
  const parsedUrl = url.parse(req.url || '');
  const [primaryQuery, secondaryQuery] = (parsedUrl.query || '').split('?');
  const params = primaryQuery.split('&');
  const options: Partial<Options> = {};
  let targetParam = '';
  for (const param of params) {
    const [key, value] = param.split('=');
    if (key) {
      if (value) {
        if (key === 'url') {
          targetParam = value;
        } else {
          _.set(options, key, value);
        }
      } else if (value === undefined) {
        targetParam = key;
      }
    }
  }
  if (secondaryQuery) {
    targetParam += `?${secondaryQuery}`;
  }
  return { targetParam, options };
}

function extractTarget(reqOrTargetParam: http.IncomingMessage | string, onlyRoot = false): string | null {
  const targetParam = _.isString(reqOrTargetParam) ? reqOrTargetParam : parseUrl(reqOrTargetParam).targetParam;
  if (targetParam) {
    let target = targetParam;
    if (!/^https?:\/\//.test(target)) {
      target = 'http://' + target;
    }
    const parsedTarget = url.parse(target);
    if (parsedTarget.href) {
      if (onlyRoot) {
        return `${parsedTarget.protocol}//${parsedTarget.host}`;
      }
      return parsedTarget.href;
    }
  }
  return null;
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
