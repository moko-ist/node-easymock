var express = require('express');
var fs = require('fs');
var url = require('url');
var http = require('http');
var path = require('path');
var app = express.createServer();

app.use(express.static(__dirname + '/public'));
app.get('*', handleAnyRequest);
app.post('*', handleAnyRequest);
app.delete('*', handleAnyRequest);
app.put('*', handleAnyRequest);

var TEMPLATE_PATTERN = new RegExp(/{{.*}}/g);

var configFile = 'config.json';

function handleAnyRequest(req, res){
  var reqUrl = url.parse(req.url);
  console.log('Request: ' + req.method + ' ' + reqUrl.pathname);

  if (shouldProxy(req)) {
    console.log('==> Proxy');
    return proxy(req, res);
  }
  var file = 'json' + reqUrl.pathname + '_' + req.method.toLowerCase() + ".json";

  console.log('==> ' + file);
  var data = readFileJson(file);
  res.send(data);
}

function readFileJson(file) {
  var data = fs.readFileSync(file, 'utf8');

  data = data.replace(TEMPLATE_PATTERN, function(match) {
    // TODO: allow variables instead of templates like SERVER_BASE_URL
    // TODO: for templates, allow {{Template(1)}} to add variables that can be used in the template like: {{param[1]}}
    var templateFile = 'json/_templates/' + match.slice(2,-2) + ".json";
    return JSON.stringify(readFileJson(templateFile));
  } );

  return JSON.parse(data);
}

function shouldProxy(req) {
  if (!path.existsSync(configFile)) {
    return false;
  }
  var config = readConfig();
  if (config.calls && config.calls[url.parse(req.url).pathname]) {
    var entry = config.calls[url.parse(req.url).pathname];
    if (typeof(entry) == 'object') {
      return entry[req.method.toLowerCase()];
    } else if (typeof(entry) == 'boolean') {
      return entry;
    }
  }
  return false;
}

function proxy(request, response) {
  var parsedUrl = url.parse(readConfig().server);
  var proxy = http.createClient(80, parsedUrl.hostname);
  request.headers['host'] = parsedUrl.hostname;
  var proxy_request = proxy.request(request.method, request.url, request.headers);
  proxy_request.addListener('response', function (proxy_response) {
    proxy_response.addListener('data', function(chunk) {
      response.write(chunk, 'binary');
    });
    proxy_response.addListener('end', function() {
      response.end();
    });
    response.writeHead(proxy_response.statusCode, proxy_response.headers);
  });
  request.addListener('data', function(chunk) {
    proxy_request.write(chunk, 'binary');
  });
  request.addListener('end', function() {
    proxy_request.end();
  });
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configFile, 'utf8'));
}

app.listen(3000);
console.log('Server running on http://localhost:3000');