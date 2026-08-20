// Static-Markdown blog: reads content/posts/*.md (front matter + body),
// renders on request. No build step — add a .md file, commit, deploy.

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const POSTS_DIR = path.join(__dirname, '..', 'content', 'posts');

function slugFromFilename(filename) {
  return filename.replace(/\.md$/i, '');
}

function listPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
  const posts = files.map((filename) => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, filename), 'utf8');
    const { data } = matter(raw);
    return {
      slug: slugFromFilename(filename),
      title: data.title || slugFromFilename(filename),
      date: data.date || null,
      excerpt: data.excerpt || '',
      tag: data.tag || 'Case study'
    };
  });
  return posts.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function getPost(slug) {
  const file = path.join(POSTS_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  const { data, content } = matter(raw);
  return {
    slug,
    title: data.title || slug,
    date: data.date || null,
    excerpt: data.excerpt || '',
    tag: data.tag || 'Case study',
    html: marked.parse(content)
  };
}

module.exports = { listPosts, getPost };
