/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { ApiSite } from '../config';
import { SearchResult } from '../types';
import { cleanHtmlTags } from '../utils';
import { decorateSearchResultQuality } from '../video-quality';
import { SourceProvider } from './types';

const DEFAULT_BASE_URL = 'https://www.duboku.tv';

export class DubokuProvider implements SourceProvider {
  name = 'duboku';

  canHandle(site: ApiSite): boolean {
    const type = site.type?.toLowerCase();
    const api = site.api?.toLowerCase() || '';
    return (
      type === 'duboku' ||
      api.includes('duboku') ||
      api.includes('dbokutv')
    );
  }

  private getBaseUrl(site: ApiSite): string {
    if (site.api && site.api.startsWith('http')) {
      return site.api.replace(/\/+$/, '');
    }
    return DEFAULT_BASE_URL;
  }

  async search(query: string, site: ApiSite): Promise<SearchResult[]> {
    const baseUrl = this.getBaseUrl(site);
    const searchUrls = [
      `${baseUrl}/vodsearch/-------------.html?wd=${encodeURIComponent(query)}`,
      `${baseUrl}/vodsearch?wd=${encodeURIComponent(query)}`,
      `https://www.duboku.tv/vodsearch/-------------.html?wd=${encodeURIComponent(query)}`,
    ];

    for (const url of searchUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Referer: `${baseUrl}/`,
            ...(site.header || {}),
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const html = await res.text();
        const results = this.parseHtml(html, baseUrl, site);
        if (results.length > 0) return results;
      } catch (err) {
        console.warn(`[DubokuProvider] 搜索失败 ${url}:`, err);
      }
    }
    return [];
  }

  private parseHtml(html: string, baseUrl: string, site: ApiSite): SearchResult[] {
    const results: SearchResult[] = [];
    const itemRegex = /<a[^>]+href=["'](\/voddetail\/(\d+)\.html)["'][^>]*title=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(html)) !== null) {
      const path = match[1];
      const id = match[2];
      const title = match[3];
      const content = match[4];

      const imgMatch = content.match(/data-original=["']([^"']+)["']|src=["']([^"']+)["']/i);
      const poster = imgMatch ? (imgMatch[1] || imgMatch[2]) : '';

      const remarksMatch = content.match(/class=["']pic-text[^"']*["'][^>]*>([^<]+)<\//i);
      const remarks = remarksMatch ? remarksMatch[1].trim() : '';

      if (id && title && !results.some((r) => r.id === id)) {
        const result: SearchResult = {
          id,
          title: cleanHtmlTags(title),
          poster: poster.startsWith('//') ? `https:${poster}` : poster,
          episodes: [`${baseUrl}${path}`],
          episodes_titles: ['全集/详情'],
          source: site.key,
          source_name: site.name,
          year: '',
          type_name: '独播',
          remarks,
          quality_tag: remarks || '高清',
        };
        results.push(decorateSearchResultQuality(result, remarks));
      }
    }
    return results;
  }
}
