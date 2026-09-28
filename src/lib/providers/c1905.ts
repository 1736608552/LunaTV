/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { ApiSite } from '../config';
import { SearchResult } from '../types';
import { cleanHtmlTags } from '../utils';
import { decorateSearchResultQuality } from '../video-quality';
import { SourceProvider } from './types';

export class C1905Provider implements SourceProvider {
  name = 'c1905';

  canHandle(site: ApiSite): boolean {
    const type = site.type?.toLowerCase();
    const api = site.api?.toLowerCase() || '';
    return (
      type === 'c1905' ||
      type === '1905' ||
      api.includes('1905.com')
    );
  }

  async search(query: string, site: ApiSite): Promise<SearchResult[]> {
    const url = `https://www.1905.com/search/index-p-type-all-q-${encodeURIComponent(query)}.html`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.1905.com/',
          ...(site.header || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return [];
      const html = await res.text();

      const results: SearchResult[] = [];
      const itemRegex = /<a[^>]+href=["'](https?:\/\/www\.1905\.com\/vod\/play\/(\d+)\.shtml)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      while ((match = itemRegex.exec(html)) !== null) {
        const playUrl = match[1];
        const id = match[2];
        const content = match[3];

        const imgMatch = content.match(/src=["']([^"']+)["']/i);
        const poster = imgMatch ? imgMatch[1] : '';

        const titleMatch = content.match(/title=["']([^"']+)["']|alt=["']([^"']+)["']|<p[^>]*>([^<]+)<\/p>/i);
        const title = (titleMatch ? (titleMatch[1] || titleMatch[2] || titleMatch[3]) : id).trim();

        if (id && title && !results.some((r) => r.id === id)) {
          const result: SearchResult = {
            id,
            title: cleanHtmlTags(title),
            poster,
            episodes: [playUrl],
            episodes_titles: ['正片/央视直连'],
            source: site.key,
            source_name: site.name,
            year: '',
            type_name: '电影',
            quality_tag: '1080P正版',
          };
          results.push(decorateSearchResultQuality(result, '1080P'));
        }
      }
      return results;
    } catch (err) {
      console.warn(`[C1905Provider] 搜索失败:`, err);
      return [];
    }
  }
}
