var GITHUB_REPO = 'brianskcheng/joycesqlee';
var FILE_PATH = 'data/projects.json';

function corsHeaders(origin, env) {
  var allowed = (env.ALLOWED_ORIGIN || 'https://joycesqlee.com').split(',').map(function (item) {
    return item.trim();
  });
  var headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  var localOrigins = ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:5500', 'http://127.0.0.1:5500'];
  if (allowed.indexOf(origin) !== -1 || localOrigins.indexOf(origin) !== -1) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
  });
}

async function githubFetch(path, options, env) {
  var repo = env.GITHUB_REPO || GITHUB_REPO;
  var url = 'https://api.github.com' + path.replace('{repo}', repo);
  return fetch(url, Object.assign({}, options, {
    headers: Object.assign({
      'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'joyce-portfolio-publish-worker'
    }, options.headers || {})
  }));
}

function isAllowedUploadPath(path) {
  if (!path || typeof path !== 'string') return false;
  if (path.indexOf('..') !== -1) return false;
  if (path.charAt(0) === '/') return false;
  return path.indexOf('projects/') === 0 || path.indexOf('portfolio/') === 0;
}

export default {
  fetch: async function (request, env) {
    var origin = request.headers.get('Origin') || '';
    var cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (!env.GITHUB_TOKEN) {
      return json({ error: 'Publish service not configured' }, 503, cors);
    }

    var url = new URL(request.url);
    var repo = env.GITHUB_REPO || GITHUB_REPO;

    try {
      if (url.pathname === '/publish' && request.method === 'POST') {
        var body = await request.json();
        if (!body.content) {
          return json({ error: 'Missing content' }, 400, cors);
        }

        var getResp = await githubFetch('/repos/{repo}/contents/' + FILE_PATH, {}, env);
        var sha = null;

        if (getResp.status === 404) {
          sha = null;
        } else if (!getResp.ok) {
          var readErr = await getResp.json().catch(function () { return {}; });
          return json({ error: readErr.message || 'Failed to read file' }, getResp.status, cors);
        } else {
          var fileData = await getResp.json();
          sha = fileData.sha;
        }

        var putBody = {
          message: 'Update portfolio projects',
          content: body.content
        };
        if (sha) {
          putBody.sha = sha;
        }

        var putResp = await githubFetch('/repos/{repo}/contents/' + FILE_PATH, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(putBody)
        }, env);

        if (!putResp.ok) {
          var putErr = await putResp.json().catch(function () { return {}; });
          return json({ error: putErr.message || 'Publish failed' }, putResp.status, cors);
        }

        var putData = await putResp.json();
        return json({
          ok: true,
          sha: putData.commit && putData.commit.sha ? putData.commit.sha : null
        }, 200, cors);
      }

      if (url.pathname === '/upload' && request.method === 'POST') {
        var uploadBody = await request.json();
        if (!uploadBody.path || !uploadBody.content) {
          return json({ error: 'Missing path or content' }, 400, cors);
        }
        if (!isAllowedUploadPath(uploadBody.path)) {
          return json({ error: 'Upload path must be under projects/ or portfolio/' }, 403, cors);
        }

        var uploadGetResp = await githubFetch('/repos/{repo}/contents/' + uploadBody.path, {}, env);
        var uploadSha = null;

        if (uploadGetResp.status === 404) {
          uploadSha = null;
        } else if (!uploadGetResp.ok) {
          var uploadReadErr = await uploadGetResp.json().catch(function () { return {}; });
          return json({ error: uploadReadErr.message || 'Failed to read file' }, uploadGetResp.status, cors);
        } else {
          var uploadFileData = await uploadGetResp.json();
          uploadSha = uploadFileData.sha;
        }

        var uploadPutBody = {
          message: uploadBody.message || ('Upload image: ' + uploadBody.path.split('/').pop()),
          content: uploadBody.content
        };
        if (uploadSha) {
          uploadPutBody.sha = uploadSha;
        }

        var uploadPutResp = await githubFetch('/repos/{repo}/contents/' + uploadBody.path, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(uploadPutBody)
        }, env);

        if (!uploadPutResp.ok) {
          var uploadPutErr = await uploadPutResp.json().catch(function () { return {}; });
          return json({ error: uploadPutErr.message || 'Upload failed' }, uploadPutResp.status, cors);
        }

        var uploadPutData = await uploadPutResp.json();
        return json({
          ok: true,
          path: uploadBody.path,
          sha: uploadPutData.content && uploadPutData.content.sha ? uploadPutData.content.sha : null
        }, 200, cors);
      }

      if (url.pathname === '/deploy-status' && request.method === 'GET') {
        var commitSha = url.searchParams.get('sha');
        var runsResp = await githubFetch('/repos/{repo}/actions/runs?event=push&branch=main&per_page=10', {}, env);
        if (!runsResp.ok) {
          return json({ status: 'unknown' }, 200, cors);
        }
        var runsData = await runsResp.json();
        var runs = runsData.workflow_runs || [];
        var matchedRun = null;
        var j;

        if (commitSha) {
          for (j = 0; j < runs.length; j++) {
            if (runs[j].head_sha === commitSha) {
              matchedRun = runs[j];
              break;
            }
          }
        }
        if (!matchedRun && runs.length) {
          matchedRun = runs[0];
        }
        if (!matchedRun) {
          return json({ status: 'unknown' }, 200, cors);
        }

        return json({
          status: matchedRun.status,
          conclusion: matchedRun.conclusion,
          url: matchedRun.html_url
        }, 200, cors);
      }

      if (url.pathname === '/history' && request.method === 'GET') {
        var historyResp = await githubFetch('/repos/{repo}/commits?path=' + FILE_PATH + '&per_page=10', {}, env);
        if (!historyResp.ok) {
          return json({ error: 'Failed to load history' }, historyResp.status, cors);
        }
        var commits = await historyResp.json();
        var simplified = commits.map(function (c) {
          return {
            sha: c.sha,
            message: c.commit.message,
            date: c.commit.author.date
          };
        });
        return json(simplified, 200, cors);
      }

      if (url.pathname === '/content' && request.method === 'GET') {
        var ref = url.searchParams.get('ref');
        if (!ref) {
          return json({ error: 'Missing ref' }, 400, cors);
        }
        var contentResp = await githubFetch('/repos/{repo}/contents/' + FILE_PATH + '?ref=' + encodeURIComponent(ref), {}, env);
        if (!contentResp.ok) {
          return json({ error: 'Failed to load content' }, contentResp.status, cors);
        }
        var contentData = await contentResp.json();
        return json({ content: contentData.content.replace(/\n/g, '') }, 200, cors);
      }

      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      return json({ error: err.message || 'Internal error' }, 500, cors);
    }
  }
};
