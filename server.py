import http.server
import socketserver
import urllib.request
import json

PORT = 8000

class AzureProxyHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        # Handle Azure DevOps Proxy Endpoints
        if self.path.startswith('/api/azure/'):
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            org = payload.get('org')
            pat = payload.get('pat')
            auth_header = 'Basic ' + urllib.request.base64.b64encode(f':{pat}'.encode('utf-8')).decode('utf-8')
            target_url = ""
            req_body = None
            
            if self.path == '/api/azure/wiql':
                target_url = f"https://dev.azure.com/{org}/_apis/wit/wiql?api-version=7.1-preview.2"
                req_body = json.dumps({'query': payload.get('query')}).encode('utf-8')
            elif self.path == '/api/azure/workitems':
                ids = payload.get('ids')
                target_url = f"https://dev.azure.com/{org}/_apis/wit/workitems?ids={ids}&$expand=none&api-version=7.1-preview.3"
            elif self.path == '/api/azure/revisions':
                work_item_id = payload.get('workItemId')
                target_url = f"https://dev.azure.com/{org}/_apis/wit/workitems/{work_item_id}/revisions?api-version=7.1-preview.3"
            
            try:
                headers = {'Authorization': auth_header, 'Content-Type': 'application/json'}
                method = 'POST' if req_body else 'GET'
                
                req = urllib.request.Request(target_url, data=req_body, headers=headers, method=method)
                with urllib.request.urlopen(req) as response:
                    res_body = response.read()
                    self.send_response(response.status)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(res_body)
            except urllib.error.HTTPError as e:
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
        else:
            self.send_error(404, "Endpoint not found")

    def do_GET(self):
        # Ignore missing favicon error
        if self.path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        # Serve static HTML/JS/CSS files normally
        super().do_GET()

print(f"Server running at http://0.0.0.0:{PORT}")
with socketserver.TCPServer(("", PORT), AzureProxyHandler) as httpd:
    httpd.serve_forever()