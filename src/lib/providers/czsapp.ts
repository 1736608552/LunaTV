/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { ApiSite } from '@/lib/config';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';
import { decorateSearchResultQuality } from '@/lib/video-quality';
import { SourceProvider } from '@/lib/providers/types';

const DEFAULT_BASE_URL = 'https://cz01.vip';
const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: 'https://cz01.vip/',
};

export class CzsappProvider implements SourceProvider {
  name = 'czsapp';

  canHandle(site: ApiSite): boolean {
    const type = site.type?.toLowerCase();
    const api = site.api?.toLowerCase() || '';
    return (
      type === 'czsapp' ||
      type === 'czs' ||
      api.includes('cz01.vip') ||
      api.includes('czzy')
    );
  }

  private getBaseUrl(site: ApiSite): string {
    if (site.api && site.api.startsWith('http')) {
      return site.api.replace(/\/+$/, '');
    }
    if (typeof site.ext === 'string' && site.ext.startsWith('http')) {
      return site.ext.replace(/\/+$/, '');
    }
    return DEFAULT_BASE_URL;
  }

  async search(query: string, site: ApiSite): Promise<SearchResult[]> {
    const baseUrl = this.getBaseUrl(site);
    const searchUrls = [
      `${baseUrl}/daoyongjiekoushidabaichi?q=${encodeURIComponent(query)}`,
      `${baseUrl}/xssearch?q=${encodeURIComponent(query)}`,
      `${baseUrl}/?s=${encodeURIComponent(query)}`,
    ];

    for (const url of searchUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
          headers: site.header || DEFAULT_HEADERS,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const html = await res.text();
        const results = this.parseHtmlList(html, baseUrl, site);
        if (results.length > 0) {
          return results;
        }
      } catch (err) {
        console.warn(`[CzsappProvider] 搜索失败 ${url}:`, err);
      }
    }
    return [];
  }

  private parseHtmlList(html: string, baseUrl: string, site: ApiSite): SearchResult[] {
    const results: SearchResult[] = [];
    // 匹配卡片结构 <a href=".../movie/123.html"...> 或类似结构
    const itemRegex = /<a[^>]+href=["'](\/movie\/([^"']+)\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(html)) !== null) {
      const path = match[1];
      const id = match[2];
      const content = match[3];

      // 提取海报
      const imgMatch = content.match(/data-original=["']([^"']+)["']|src=["']([^"']+)["']/i);
      const poster = imgMatch ? (imgMatch[1] || imgMatch[2]) : '';

      // 提取标题
      const titleMatch = content.match(/alt=["']([^"']+)["']|class=["']name["'][^>]*>([^<]+)<\//i);
      const title = (titleMatch ? (titleMatch[1] || titleMatch[2]) : id).trim();

      // 提取画质备注
      const remarksMatch = content.match(/class=["']jac["'][^>]*>([^<]+)<\/|class=["']note["'][^>]*>([^<]+)<\//i);
      const remarks = remarksMatch ? (remarksMatch[1] || remarksMatch[2]).trim() : '';

      if (id && title && !results.some((r) => r.id === id)) {
        const result: SearchResult = {
          id,
          title: cleanHtmlTags(title),
          poster: poster.startsWith('//') ? `https:${poster}` : poster,
          episodes: [`${baseUrl}${path}`],
          episodes_titles: ['正片/立即播放'],
          source: site.key,
          source_name: site.name,
          class: '',
          year: '',
          desc: '',
          type_name: '影视',
          remarks,
          quality_tag: remarks || '4K/1080P',
        };
        results.push(decorateSearchResultQuality(result, remarks));
      }
    }
    return results;
  }

  async detail(id: string, site: ApiSite): Promise<SearchResult | null> {
    const baseUrl = this.getBaseUrl(site);
    const detailUrl = id.startsWith('http') ? id : `${baseUrl}/movie/${id}.html`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(detailUrl, {
        headers: site.header || DEFAULT_HEADERS,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const html = await res.text();

      // 提取标题与详情
      const titleMatch = html.match(/<h1>([^<]+)<\/h1>/i);
      const title = titleMatch ? titleMatch[1].trim() : id;

      const posterMatch = html.match(/class=["']dyimg[^"']*["'][^>]*>\s*<img[^>]+src=["']([^"']+)["']/i);
      const poster = posterMatch ? posterMatch[1] : '';

      // 提取选集列表
      const episodes: string[] = [];
      const episodesTitles: string[] = [];
      const playBtnRegex = /<a[^>]+href=["'](\/v_play\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi;
      let pMatch: RegExpExecArray | null;

      while ((pMatch = playBtnRegex.exec(html)) !== null) {
        episodes.push(`${baseUrl}${pMatch[1]}`);
        episodesTitles.push(pMatch[2].trim());
      }

      const result: SearchResult = {
        id,
        title: cleanHtmlTags(title),
        poster: poster.startsWith('//') ? `https:${poster}` : poster,
        episodes: episodes.length > 0 ? episodes : [detailUrl],
        episodes_titles: episodesTitles.length > 0 ? episodesTitles : ['正片'],
        source: site.key,
        source_name: site.name,
        year: '',
        type_name: '电影',
      };
      return decorateSearchResultQuality(result);
    } catch (err) {
      console.warn(`[CzsappProvider] 获取详情失败 ${detailUrl}:`, err);
      return null;
    }
  }
}
