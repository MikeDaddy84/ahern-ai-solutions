import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/portal/satori-assets/',
  css: { postcss: { plugins: [{
    postcssPlugin: 'satori-portal-scope',
    Rule(rule: any) {
      if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return;
      if (rule.selector.includes('.satori-host')) return;
      rule.selector = rule.selector.split(',').map((part: string) => {
        const selector = part.trim();
        return [':root', 'html', 'body'].includes(selector) ? '.satori-host' : `.satori-host ${selector}`;
      }).join(', ');
    }
  }] } },
  root: 'src/client',
  build: {
    outDir: '../../dist/public',
    emptyOutDir: true,
    target: 'es2022'
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080',
      '/health': 'http://localhost:8080'
    }
  }
});
