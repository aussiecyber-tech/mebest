import http.server
import socketserver
import os
import sys
import webbrowser

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class SPAModuleHTTPHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def translate_path(self, path):
        # Get path from standard resolver
        clean_path = path.split('?')[0].split('#')[0]
        disk_path = super().translate_path(clean_path)
        
        # If the file exists, serve it
        if os.path.exists(disk_path):
            return disk_path
        
        # If it has a static asset extension, don't fallback to index.html (let it 404 cleanly)
        ext = os.path.splitext(clean_path)[1].lower()
        if ext in ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf']:
            return disk_path
            
        # For all client-side SPA routes (e.g., /about, /portal, /appointments, /services), serve index.html
        return os.path.join(DIRECTORY, 'index.html')

def run():
    os.chdir(DIRECTORY)
    # Allow port reuse so restarting doesn't hit TIME_WAIT
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), SPAModuleHTTPHandler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 60)
        print(f"  MBEST Learning Management System")
        print(f"  Local Web Server running at: {url}")
        print("=" * 60)
        print("Press Ctrl+C in this window to stop the server.\n")
        sys.stdout.flush()
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.server_close()

if __name__ == '__main__':
    run()
