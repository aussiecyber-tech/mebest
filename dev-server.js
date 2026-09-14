const http = require('http');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port') !== -1 ? args.indexOf('--port') : args.indexOf('-p');
const argPort = portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : null;
let PORT = argPort || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
const ROOT_DIR = path.resolve(__dirname);

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

const clients = new Set();

// Dynamically load client-bridge.js for Live Reload, Mock API, and Quick Login UI
function getInjectedDevScript() {
  const bridgePath = path.join(ROOT_DIR, 'client-bridge.js');
  let scriptContent = '';
  try {
    scriptContent = fs.readFileSync(bridgePath, 'utf8');
  } catch (e) {
    console.error('Warning: could not read client-bridge.js:', e.message);
  }
  return `\n<!-- MBEST Hot Live Reload & Portal Mock Bridge -->\n<script>\n${scriptContent}\n</script>\n`;
}

function notifyClients(type) {
  for (const client of clients) {
    try {
      client.write(`data: ${type}\n\n`);
    } catch (e) {
      clients.delete(client);
    }
  }
}

let debounceTimer = null;
function setupWatcher() {
  try {
    fs.watch(ROOT_DIR, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const normalized = filename.replace(/\\/g, '/');
      if (
        normalized.includes('node_modules') ||
        normalized.includes('.git') ||
        normalized.includes('backend/data') ||
        normalized.includes('.system_generated') ||
        normalized === 'dev-server.js' ||
        normalized.endsWith('.tmp') ||
        normalized.endsWith('.log')
      ) {
        return;
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const ext = path.extname(normalized).toLowerCase();
        console.log(`[Change Detected] ${normalized} (${eventType})`);
        if (ext === '.css') {
          notifyClients('css-reload');
        } else {
          notifyClients('reload');
        }
      }, 100);
    });
  } catch (err) {
    console.error('File watcher warning:', err.message);
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/__livereload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    clients.add(res);

    req.on('close', () => {
      clients.delete(res);
    });
    return;
  }

  // Fallback demo personas when backend is offline
  const FALLBACK_USERS = {
    admin: {
      id: "1",
      name: "Super Administrator",
      email: "admin@mbest.com",
      role: "admin",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150"
    },
    tutor: {
      id: "201",
      name: "Dr. Sarah Mitchell",
      email: "tutor@mbest.com",
      role: "tutor",
      avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150"
    },
    parent: {
      id: "301",
      name: "David Miller",
      email: "parent@mbest.com",
      role: "parent",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150"
    },
    student: {
      id: "101",
      name: "Alex Johnson",
      email: "student@mbest.com",
      role: "student",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150"
    }
  };

  function handleOfflineApi(req, res, endpointPath, bodyStr) {
    let body = {};
    try {
      if (bodyStr) body = JSON.parse(bodyStr);
    } catch (e) {}

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });

    if (req.method === 'OPTIONS') {
      res.end();
      return;
    }

    const endpoint = endpointPath.split('?')[0];

    // 1. POST /auth/login
    if (endpoint.endsWith('/auth/login') && req.method === 'POST') {
      const email = (body.email || '').toLowerCase().trim();
      let role = 'student';
      if (email.includes('admin')) role = 'admin';
      else if (email.includes('tutor')) role = 'tutor';
      else if (email.includes('parent')) role = 'parent';

      const user = FALLBACK_USERS[role] || FALLBACK_USERS.student;
      const token = `mbest_demo_token_${user.role}_${Date.now()}`;
      const userPayload = {
        id: String(user.id),
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar
      };

      res.end(JSON.stringify({
        success: true,
        token,
        accessToken: token,
        user: userPayload,
        data: {
          token,
          accessToken: token,
          user: userPayload
        }
      }));
      return;
    }

    // 2. GET /auth/me
    if (endpoint.endsWith('/auth/me') && req.method === 'GET') {
      const authHeader = (req.headers['authorization'] || '').toLowerCase();
      let role = 'admin';
      if (authHeader.includes('tutor')) role = 'tutor';
      else if (authHeader.includes('parent')) role = 'parent';
      else if (authHeader.includes('student')) role = 'student';

      const user = FALLBACK_USERS[role] || FALLBACK_USERS.admin;
      res.end(JSON.stringify({
        success: true,
        data: {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar
        }
      }));
      return;
    }

    // 3. POST /auth/logout
    if (endpoint.endsWith('/auth/logout')) {
      res.end(JSON.stringify({ success: true, message: 'Logged out successfully' }));
      return;
    }

    // 3b. Profile endpoints
    if (endpoint.endsWith('/profile') || endpoint.includes('/profile/') || endpoint.includes('/profile?')) {
      const authHeader = (req.headers['authorization'] || '').toLowerCase();
      let role = 'admin';
      if (authHeader.includes('tutor')) role = 'tutor';
      else if (authHeader.includes('parent')) role = 'parent';
      else if (authHeader.includes('student')) role = 'student';

      if (endpoint.endsWith('/profile/avatar') && req.method === 'POST') {
        res.end(JSON.stringify({
          success: true,
          data: { avatar: FALLBACK_USERS[role]?.avatar || FALLBACK_USERS.admin.avatar }
        }));
        return;
      }

      if (endpoint.endsWith('/profile/password')) {
        res.end(JSON.stringify({
          success: true,
          message: 'Password updated successfully'
        }));
        return;
      }

      const defaultProfiles = {
        admin: {
          id: "1",
          name: "Super Administrator",
          email: "admin@mbest.com",
          role: "admin",
          avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150",
          phone: "+1 (555) 019-2834",
          date_of_birth: "1988-06-15",
          address: "123 Education Blvd, Suite 400",
          location: "123 Education Blvd, Suite 400",
          bio: "Lead System Administrator managing operations, tutor allocations, student records, and system settings for MBEST.",
          is_active: true
        },
        tutor: {
          id: "201",
          name: "Dr. Sarah Mitchell",
          email: "tutor@mbest.com",
          role: "tutor",
          avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150",
          phone: "+1 (555) 234-5678",
          date_of_birth: "1985-09-20",
          address: "456 Academy Way, Boston, MA",
          location: "456 Academy Way, Boston, MA",
          bio: "Senior Mathematics and Science Instructor with over 10 years of experience.",
          is_active: true,
          tutor: { specialization: 'Mathematics & Science', hourly_rate: 65, qualifications: 'Ph.D. in Applied Mathematics', experience_years: 10 }
        },
        parent: {
          id: "301",
          name: "David Miller",
          email: "parent@mbest.com",
          role: "parent",
          avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
          phone: "+1 (555) 345-6789",
          date_of_birth: "1980-11-05",
          address: "789 Family Park, Chicago, IL",
          location: "789 Family Park, Chicago, IL",
          bio: "Parent of enrolled students in the MBEST Learning System.",
          is_active: true
        },
        student: {
          id: "101",
          name: "Alex Johnson",
          email: "student@mbest.com",
          role: "student",
          avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
          phone: "+1 (555) 456-7890",
          date_of_birth: "2008-03-14",
          address: "101 Campus Road, Austin, TX",
          location: "101 Campus Road, Austin, TX",
          bio: "Year 10 student preparing for advanced math and science competitions.",
          is_active: true,
          student: { year_level: 'Year 10' }
        }
      };

      if (req.method === 'PUT' || req.method === 'POST') {
        const base = defaultProfiles[role] || defaultProfiles.admin;
        const updated = Object.assign({}, base, body || {});
        if (body.address) updated.location = body.address;
        if (body.location) updated.address = body.location;
        res.end(JSON.stringify({
          success: true,
          message: 'Profile updated successfully',
          data: updated
        }));
        return;
      }

      res.end(JSON.stringify({
        success: true,
        data: defaultProfiles[role] || defaultProfiles.admin
      }));
      return;
    }

    // 4. Notifications
    if (endpoint.includes('/notifications/unread-count')) {
      res.end(JSON.stringify({ success: true, data: { unread_count: 0 } }));
      return;
    }
    if (endpoint.includes('/notifications')) {
      res.end(JSON.stringify({ success: true, data: [] }));
      return;
    }

    // 5. Dashboards
    if (endpoint.includes('/admin/dashboard')) {
      res.end(JSON.stringify({
        success: true,
        data: {
          total_students: 48,
          total_tutors: 12,
          total_classes: 8,
          monthly_revenue: 14250,
          recent_activity: []
        }
      }));
      return;
    }

    if (endpoint.includes('/student/dashboard')) {
      res.end(JSON.stringify({
        success: true,
        data: {
          enrolled_classes: 4,
          pending_assignments: 2,
          attendance_rate: 96,
          upcoming_sessions: []
        }
      }));
      return;
    }

    if (endpoint.includes('/tutor/dashboard')) {
      res.end(JSON.stringify({
        success: true,
        data: {
          assigned_students: 15,
          active_classes: 3,
          upcoming_sessions: [],
          pending_reviews: 1
        }
      }));
      return;
    }

    if (endpoint.includes('/parent/dashboard')) {
      res.end(JSON.stringify({
        success: true,
        data: {
          children: [
            { id: '101', name: 'Alex Johnson', grade: 'Year 10', attendance: '96%' }
          ]
        }
      }));
      return;
    }

    // 6. Users & Stats
    if (endpoint.includes('/admin/users/stats')) {
      res.end(JSON.stringify({
        success: true,
        data: { total: 60, students: 45, tutors: 12, parents: 3 }
      }));
      return;
    }

    if (endpoint.includes('/admin/users')) {
      res.end(JSON.stringify({
        success: true,
        data: {
          data: Object.values(FALLBACK_USERS).map(u => ({
            id: String(u.id),
            name: u.name,
            email: u.email,
            role: u.role,
            is_active: true
          })),
          total: 4,
          current_page: 1,
          last_page: 1
        }
      }));
      return;
    }

    // 7. General GET
    if (req.method === 'GET') {
      res.end(JSON.stringify({
        success: true,
        data: {
          data: [],
          total: 0,
          current_page: 1,
          last_page: 1
        }
      }));
      return;
    }

    // Generic mutation response
    res.end(JSON.stringify({
      success: true,
      message: 'Processed successfully',
      data: body
    }));
  }

  // Proxy API traffic directly to the Express backend (Port 5000) with fallback handler
  if (req.url.startsWith('/api') || req.url.startsWith('/mbest/public/api')) {
    const cleanPath = req.url.replace('/mbest/public', '');
    const bodyChunks = [];
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', () => {
      const bodyBuffer = Buffer.concat(bodyChunks);
      const proxyReq = http.request({
        hostname: 'localhost',
        port: 5000,
        path: cleanPath,
        method: req.method,
        headers: {
          ...req.headers,
          host: 'localhost:5000'
        }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      });

      proxyReq.on('error', (err) => {
        // Express backend is offline -> fulfill smoothly via local fallback handler
        handleOfflineApi(req, res, cleanPath, bodyBuffer.toString('utf8'));
      });

      if (bodyBuffer.length > 0) {
        proxyReq.write(bodyBuffer);
      }
      proxyReq.end();
    });
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // If someone visits /portal, redirect to /auth/signin for clean entry
  if (pathname === '/portal') {
    pathname = '/auth/signin';
  }

  let safePath = path.normalize(path.join(ROOT_DIR, pathname));
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let stat = null;
  try {
    if (fs.existsSync(safePath)) {
      stat = fs.statSync(safePath);
      if (stat.isDirectory()) {
        safePath = path.join(safePath, 'index.html');
        if (fs.existsSync(safePath)) {
          stat = fs.statSync(safePath);
        } else {
          stat = null;
        }
      }
    }
  } catch (e) {
    stat = null;
  }

  const ext = path.extname(pathname).toLowerCase();
  const staticAssetExts = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.json'];

  if (stat && stat.isFile()) {
    const fileExt = path.extname(safePath).toLowerCase();
    const mimeType = MIME_TYPES[fileExt] || 'application/octet-stream';

    if (fileExt === '.html') {
      let content = fs.readFileSync(safePath, 'utf8');
      const devScript = getInjectedDevScript();
      if (content.includes('</body>')) {
        content = content.replace('</body>', `${devScript}\n</body>`);
      } else {
        content += devScript;
      }
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(content);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stat.size,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(safePath).pipe(res);
    return;
  }

  if (staticAssetExts.includes(ext)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File Not Found');
    return;
  }

  // SPA Fallback: serve index.html with injected script
  const indexPath = path.join(ROOT_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    let content = fs.readFileSync(indexPath, 'utf8');
    const devScript = getInjectedDevScript();
    if (content.includes('</body>')) {
      content = content.replace('</body>', `${devScript}\n</body>`);
    } else {
      content += devScript;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(content);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('index.html not found');
  }
});

function listenOnPort(port) {
  server.listen(port, '0.0.0.0', () => {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    let networkIP = null;
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          networkIP = net.address;
          break;
        }
      }
      if (networkIP) break;
    }

    const localUrl   = `http://localhost:${port}`;
    const networkUrl = networkIP ? `http://${networkIP}:${port}` : 'N/A';

    console.log('============================================================');
    console.log('  🔥 MBEST LMS - HOT LIVE SERVER WITH PORTAL ACCESS ACTIVE');
    console.log(`  Local URL:       ${localUrl}`);
    console.log(`  Network URL:     ${networkUrl}  ← share this with teammates`);
    console.log('  Hot Reload:      ACTIVE (Auto-reloads on file changes)');
    console.log('  CSS HMR:         ACTIVE (Hot swaps stylesheets)');
    console.log('  Portal Demo:     ACTIVE (Admin, Tutor, Parent, Student)');
    console.log('  SPA Routes:      ACTIVE (/admin, /student, /tutor, /parent)');
    console.log('============================================================');
    console.log('Press Ctrl+C in this terminal to stop the server.\n');

    setupWatcher();
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Port ${PORT} is busy, automatically trying port ${PORT + 1}...]`);
    PORT++;
    listenOnPort(PORT);
  } else {
    console.error('Server error:', err);
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught server exception:', err);
});

listenOnPort(PORT);
