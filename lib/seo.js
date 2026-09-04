// robots.txt and sitemap.xml, both generated rather than committed as static
// files — they have to change shape depending on whether the pre-launch gate
// is up (see lib/gate.js), and the sitemap has to stay in step with
// content/posts/ without anyone remembering to update it.

const blog = require('./blog');

const DEFAULT_SITE_URL = 'https://ahernai.com';

// www.ahernai.com 301s to the apex, so the apex is the canonical host. Every
// canonical, og:url, and sitemap entry is built from this one value.
function siteUrl() {
  return (process.env.SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

function absoluteUrl(pathname = '/') {
  const p = String(pathname || '/');
  return siteUrl() + (p.startsWith('/') ? p : `/${p}`);
}

function robotsTxt({ gated }) {
  if (gated) {
    return ['User-agent: *', 'Disallow: /', ''].join('\n');
  }

  return [
    'User-agent: *',
    'Allow: /',
    '',
    // Nothing under /api/ renders a page worth indexing, and /api/track is a
    // POST beacon that would just log crawler noise as real pageviews.
    'Disallow: /api/',
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    ''
  ].join('\n');
}

function escapeXml(str) {
  return String(str || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])
  );
}

// YYYY-MM-DD. Front matter dates come through gray-matter as Date objects
// when unquoted and strings when quoted, so normalise both.
function isoDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function sitemapXml() {
  const staticPages = [
    { path: '/', priority: '1.0', changefreq: 'monthly' },
    { path: '/pc-builder', priority: '0.9', changefreq: 'monthly' },
    { path: '/blog', priority: '0.7', changefreq: 'weekly' },
    { path: '/about', priority: '0.5', changefreq: 'yearly' },
    { path: '/privacy', priority: '0.3', changefreq: 'yearly' }
  ];

  const posts = blog.listPosts().map((post) => ({
    path: `/blog/${encodeURIComponent(post.slug)}`,
    priority: '0.6',
    changefreq: 'yearly',
    lastmod: isoDate(post.date)
  }));

  // Static pages get no lastmod on purpose: a date that moves every deploy
  // teaches crawlers the field means nothing, which costs more than it gains.
  const entries = [...staticPages, ...posts]
    .map((entry) => {
      const lines = [
        '  <url>',
        `    <loc>${escapeXml(absoluteUrl(entry.path))}</loc>`,
        entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority}</priority>`,
        '  </url>'
      ];
      return lines.filter(Boolean).join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

// Structured data for a single post. The author is the organisation rather
// than a named person on purpose — putting someone's legal name into machine-
// readable markup on a public page is a decision for them to make, not a
// default. The LocalBusiness node lives in public/index.html instead of here,
// because one such node on the home page is what crawlers expect and a second
// copy on every page is how the two drift apart.
function blogPostingSchema(post) {
  const url = absoluteUrl('/blog/' + encodeURIComponent(post.slug));
  const published = isoDate(post.date);
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt || post.title,
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    datePublished: published || undefined,
    image: absoluteUrl('/brand/og-image.png'),
    author: { '@type': 'Organization', name: 'Ahern AI Solutions', url: siteUrl() },
    publisher: {
      '@type': 'Organization',
      name: 'Ahern AI Solutions',
      url: siteUrl(),
      logo: { '@type': 'ImageObject', url: absoluteUrl('/brand/og-image.png') }
    }
  };
}

module.exports = { siteUrl, absoluteUrl, robotsTxt, sitemapXml, blogPostingSchema };
