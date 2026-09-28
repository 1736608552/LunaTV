/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { ApiSite } from '@/lib/config';
import { SearchResult } from '@/lib/types';
import { cleanHtmlTags } from '@/lib/utils';
import { decorateSearchResultQuality } from '@/lib/video-quality';
import { SourceProvider } from './types';

export class ReboProvider implements SourceProvider {
  name = 'apprj';

  canHandle(site: ApiSite): boolean {
    const type = site.type?.toLowerCase();
    const api = site.api?.toLowerCase() || '';
    return (
      type === 'apprj' ||
      type === 'rebo' ||
      api.includes('rbotv.cn')
    );
  }

  private getBaseUrl(site: ApiSite): string {
    if (typeof site.ext === 'object' && site.ext?.url) {
      return String(site.ext.url).replace(/\/+$/, '');
    }
    if (site.api && site.api.startsWith('http')) {
      return site.api.replace(/\/+$/, '');
    }
    return 'http://v.rbotv.cn';
  }

  async search(query: string, site: ApiSite): Promise<SearchResult[]> {
    const baseUrl = this.getBaseUrl(site);
    const urls = [
      `${baseUrl}/v3/home/search?keyword=${encodeURIComponent(query)}`,
      `${baseUrl}/v3/home/search?wd=${encodeURIComponent(query)}`,
      `${baseUrl}/v3/home/type_search?keyword=${encodeURIComponent(query)}`,
    ];

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'okhttp-okgo/jeasonlzy',
            Accept: 'application/json',
            ...(site.header || {}),
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok) continue;
        const json = await res.json();
        const list = json?.data?.list || json?.list || json?.data || [];
        if (!Array.isArray(list) || list.length === 0) continue;

        return list.map((item: any) => {
          const id = String(item.vod_id || item.id || '');
          const title = String(item.vod_name || item.name || '').trim();
          const poster = String(item.vod_pic || item.pic || '').trim();
          const remarks = String(item.vod_remarks || '');

          const result: SearchResult = {
            id,
            title: cleanHtmlTags(title),
            poster,
            episodes: [`${baseUrl}/v3/home/vod_details?vod_id=${id}`],
            episodes_titles: ['全集/播放'],
            source: site.key,
            source_name: site.name,
            class: item.vod_class || '',
            year: item.vod_year ? String(item.vod_year) : '',
            desc: cleanHtmlTags(item.vod_content || ''),
            remarks,
            quality_tag: remarks || '热播专线',
          };
          return decorateSearchResultQuality(result, remarks);
        });
      } catch (err) {
        console.warn(`[ReboProvider] 搜索失败:`, err);
      }
    }
    return [];
  }

  async detail(id: string, site: ApiSite): Promise<SearchResult | null> {
    const baseUrl = this.getBaseUrl(site);
    const url = `${baseUrl}/v3/home/vod_details?vod_id=${id}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'okhttp-okgo/jeasonlzy',
          Accept: 'application/json',
          ...(site.header || {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const json = await res.json();
      const data = json?.data || json;
      if (!data) return null;

      const title = String(data.vod_name || id).trim();
      const poster = String(data.vod_pic || '').trim();
      const playUrl = data.vod_play_url || data.play_url;

      const episodes: string[] = [];
      const titles: string[] = [];

      if (playUrl) {
        const parts = String(playUrl).split('#');
        parts.forEach((p, idx) => {
          const pair = p.split('$');
          if (pair.length >= 2) {
            titles.push(pair[0]);
            episodes.push(pair[1]);
          } else {
            titles.push(`第${idx + 1}集`);
            episodes.push(pair[0]);
          }
        });
      }

      const result: SearchResult = {
        id,
        title: cleanHtmlTags(title),
        poster,
        episodes,
        episodes_titles: titles,
        source: site.key,
        source_name: site.name,
        year: data.vod_year ? String(data.vod_year) : '',
        desc: cleanHtmlTags(data.vod_content || ''),
        remarks: data.vod_remarks || '',
      };
      return decorateSearchResultQuality(result);
    } catch (err) {
      console.warn(`[ReboProvider] 获取详情失败:`, err);
      return null;
    }
  }
}
