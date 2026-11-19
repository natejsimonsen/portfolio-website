// Builds the site into dist/. Usage:
//   node build.mjs            production build
//   node build.mjs --drafts   include posts marked `draft: true`
//   node build.mjs --serve    build with drafts, serve on :4321, rebuild on change
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { marked } from 'marked';
import { enso, garden, ripples, seal } from './src/art.mjs';

const root = path.dirname(new URL(import.meta.url).pathname);
const out = path.join(root, 'dist');
const serve = process.argv.includes('--serve');
const drafts = serve || process.argv.includes('--drafts');

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

const longDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// Front matter is optional: `key: value` lines between two `---` lines.
function frontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    if (pair) meta[pair[1].toLowerCase()] = pair[2].replace(/^(["'])(.*)\1$/, '$2').trim();
  }
  return { meta, body: raw.slice(match[0].length) };
}

// When a post has no date, use the day its file was first committed.
function firstCommitDate(file) {
  try {
    const log = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%aI', '--', file], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return log ? log.split('\n').pop().slice(0, 10) : null;
  } catch {
    return null;
  }
}

function loadPosts() {
  const dir = path.join(root, 'posts');
  const posts = [];
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
    const file = path.join(dir, name);
    const { meta, body } = frontMatter(fs.readFileSync(file, 'utf8'));
    if (meta.draft === 'true' && !drafts) continue;

    const stem = name.replace(/\.md$/, '');
    const prefix = stem.match(/^(\d{4}-\d{2}-\d{2})-?(.*)$/);
    const heading = body.match(/^\s*#\s+(.+)$/m);
    const text = heading ? body.replace(heading[0], '') : body;
    const firstParagraph = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .find((p) => p && !/^[#>`|!<-]/.test(p));
    const plain = (firstParagraph || '').replace(/[*_`]|\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ');

    const date =
      meta.date?.slice(0, 10) ||
      prefix?.[1] ||
      firstCommitDate(file) ||
      fs.statSync(file).mtime.toISOString().slice(0, 10);
    const title = meta.title || heading?.[1].trim() || (prefix?.[2] || stem).replace(/[-_]+/g, ' ');

    posts.push({
      slug: (meta.slug || prefix?.[2] || stem).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      title,
      date,
      when: new Date(`${date}T00:00:00Z`),
      description: meta.description || (plain.length > 160 ? `${plain.slice(0, 157).trimEnd()}…` : plain),
      draft: meta.draft === 'true',
      minutes: Math.max(1, Math.round(text.split(/\s+/).length / 220)),
      html: marked.parse(text),
    });
  }
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

function page(site, { title, description, url, body, current }) {
  const fullTitle = title ? `${title} · ${site.name}` : `${site.name} · ${site.role}`;
  const nav = [
    ['About', '/#about'],
    ['Projects', '/#projects'],
    ['Writing', '/blog/'],
    ['Contact', '/#contact'],
  ]
    .map(([label, href]) => `<a href="${href}"${label === current ? ' aria-current="page"' : ''}>${label}</a>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f3ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151614" media="(prefers-color-scheme: dark)">
<meta property="og:title" content="${esc(title || site.name)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${site.url}${url}">
<meta property="og:type" content="${url.startsWith('/blog/') && url !== '/blog/' ? 'article' : 'website'}">
<link rel="canonical" href="${site.url}${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/atom+xml" title="${esc(site.name)}" href="/feed.xml">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
<a class="name" href="/">${esc(site.name)}</a>
<nav aria-label="Main">${nav}</nav>
</header>
<main id="main">
${body}
</main>
<footer class="bottom">
${seal}
<p>${esc(site.name)} · ${new Date().getUTCFullYear()}</p>
<p><a href="/feed.xml">Feed</a></p>
</footer>
</body>
</html>
`;
}

function postList(posts) {
  if (!posts.length) return '<p class="quiet">Nothing here yet.</p>';
  return `<ol class="posts">${posts
    .map(
      (p) => `<li>
<a href="/blog/${p.slug}/">
${ripples(p.slug)}
<span class="post-text">
<span class="post-title">${esc(p.title)}${p.draft ? ' <span class="tag">Draft</span>' : ''}</span>
<span class="post-desc">${esc(p.description)}</span>
</span>
<time datetime="${p.date}">${shortDate.format(p.when)}</time>
</a>
</li>`,
    )
    .join('')}</ol>`;
}

function home(site, posts, about) {
  const projects = site.projects
    .map(
      (p) => `<li><a href="${esc(p.url)}">
<span class="project-name">${esc(p.name)}</span>
<span class="project-desc">${esc(p.description)}</span>
</a></li>`,
    )
    .join('');
  const contact = site.contact
    .map((c) => `<li><span class="label">${esc(c.label)}</span><a href="${esc(c.url)}">${esc(c.text)}</a></li>`)
    .join('');
  return `<section class="hero">
<div>
<p class="label">${esc(site.role)}</p>
<h1>${esc(site.name)}</h1>
<p class="lede">${esc(site.tagline)}</p>
</div>
${enso(site.name)}
</section>

<section id="about" aria-labelledby="about-h">
<h2 id="about-h">About</h2>
<div class="prose">${about}</div>
</section>

${garden('home')}

<section id="projects" aria-labelledby="projects-h">
<h2 id="projects-h">Projects</h2>
<ul class="projects">${projects}</ul>
</section>

<section id="writing" aria-labelledby="writing-h">
<h2 id="writing-h">Writing</h2>
${postList(posts.slice(0, 5))}
${posts.length > 5 ? '<p class="more"><a href="/blog/">All writing</a></p>' : ''}
</section>

<section id="contact" aria-labelledby="contact-h">
<h2 id="contact-h">Contact</h2>
<p class="prose">${esc(site.contactNote)}</p>
<ul class="contact">${contact}</ul>
</section>`;
}

function blogIndex(posts) {
  return `<section class="page-head">
<h1>Writing</h1>
<p class="lede">Notes on infrastructure, tools, and whatever else holds my attention.</p>
</section>
${garden('writing', { height: 96 })}
${postList(posts)}`;
}

function postPage(post, newer, older) {
  const link = (p, label) =>
    p ? `<a href="/blog/${p.slug}/"><span class="label">${label}</span>${esc(p.title)}</a>` : '<span></span>';
  return `<article>
<header class="page-head">
<p class="label"><time datetime="${post.date}">${longDate.format(post.when)}</time> · ${post.minutes} min read${post.draft ? ' · <span class="tag">Draft</span>' : ''}</p>
<h1>${esc(post.title)}</h1>
</header>
${garden(post.slug, { height: 96 })}
<div class="prose">${post.html}</div>
</article>
<nav class="pager" aria-label="More writing">
${link(older, 'Older')}
${link(newer, 'Newer')}
</nav>`;
}

function feed(site, posts) {
  const entries = posts
    .filter((p) => !p.draft)
    .slice(0, 20)
    .map(
      (p) => `<entry>
<title>${esc(p.title)}</title>
<link href="${site.url}/blog/${p.slug}/"/>
<id>${site.url}/blog/${p.slug}/</id>
<updated>${p.date}T00:00:00Z</updated>
<summary>${esc(p.description)}</summary>
<content type="html">${esc(p.html)}</content>
</entry>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>${esc(site.name)}</title>
<link href="${site.url}/"/>
<link rel="self" href="${site.url}/feed.xml"/>
<id>${site.url}/</id>
<updated>${posts[0]?.date || new Date().toISOString().slice(0, 10)}T00:00:00Z</updated>
<author><name>${esc(site.name)}</name></author>
${entries}
</feed>
`;
}

function write(file, content) {
  const target = path.join(out, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function build() {
  const site = JSON.parse(fs.readFileSync(path.join(root, 'content/site.json'), 'utf8'));
  const about = marked.parse(fs.readFileSync(path.join(root, 'content/about.md'), 'utf8'));
  const posts = loadPosts();

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  if (fs.existsSync(path.join(root, 'public'))) fs.cpSync(path.join(root, 'public'), out, { recursive: true });
  fs.copyFileSync(path.join(root, 'src/style.css'), path.join(out, 'style.css'));
  write('favicon.svg', seal);
  write('CNAME', `${new URL(site.url).hostname}\n`);

  write('index.html', page(site, { description: site.tagline, url: '/', body: home(site, posts, about) }));
  write(
    'blog/index.html',
    page(site, {
      title: 'Writing',
      description: `Writing by ${site.name}.`,
      url: '/blog/',
      body: blogIndex(posts),
      current: 'Writing',
    }),
  );
  posts.forEach((post, i) =>
    write(
      `blog/${post.slug}/index.html`,
      page(site, {
        title: post.title,
        description: post.description,
        url: `/blog/${post.slug}/`,
        body: postPage(post, posts[i - 1], posts[i + 1]),
        current: 'Writing',
      }),
    ),
  );
  write(
    '404.html',
    page(site, {
      title: 'Not found',
      description: 'This page does not exist.',
      url: '/404.html',
      body: `<section class="page-head lost">${enso('lost', 'lost')}<h1>Nothing here</h1><p class="lede">This page does not exist. <a href="/">Go home</a>.</p></section>`,
    }),
  );
  write('feed.xml', feed(site, posts));
  console.log(`built ${posts.length} post(s) into dist/`);
}

build();

if (serve) {
  const types = { '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
  for (const dir of ['posts', 'content', 'src', 'public']) {
    if (!fs.existsSync(path.join(root, dir))) continue;
    let timer;
    fs.watch(path.join(root, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          build();
        } catch (err) {
          console.error(err.message);
        }
      }, 100);
    });
  }
  http
    .createServer((req, res) => {
      let file = path.join(out, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!file.startsWith(out)) file = out;
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      const found = fs.existsSync(file);
      if (!found) file = path.join(out, '404.html');
      res.writeHead(found ? 200 : 404, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    })
    .listen(4321, () => console.log('http://localhost:4321'));
}
